using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Auth;
using Booking.Application.Features.Clinics;
using Booking.Domain.Entities;
using Booking.Infrastructure.Notifications;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Regjistrimi vetëshërbyes i klinikës: katër entitete atomike, klinikë e padukshme
/// derisa aprovohet, dhe dy njoftime.
/// </summary>
[Collection("api")]
public class ClinicRegistrationTests
{
    private readonly BookingApiFactory _factory;

    public ClinicRegistrationTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    // ---------- Krijimi ----------

    [Fact]
    public async Task RegisterClinic_CreatesUserClinicAdministratorAndBranch()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest();

        var registration = await RegisterClinicAsync(client, request);

        registration.IsApproved.Should().BeFalse();
        registration.ClinicName.Should().Be(request.ClinicName);
        registration.Auth.Roles.Should().Contain("ClinicAdmin");
        registration.Auth.AccessToken.Should().NotBeNullOrEmpty();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();

        var clinic = await db.Clinics.FirstAsync(c => c.Id == registration.ClinicId);
        clinic.IsApproved.Should().BeFalse();
        clinic.IsActive.Should().BeTrue();
        clinic.PhoneNumber.Should().Be(request.ClinicPhoneNumber);
        clinic.Email.Should().Be(request.ClinicEmail);

        var user = await db.Users.FirstAsync(u => u.Id == registration.Auth.UserId);
        user.Email.Should().Be(request.Email);

        var isAdministrator = await db.ClinicAdministrators
            .AnyAsync(a => a.UserId == user.Id && a.ClinicId == clinic.Id);
        isAdministrator.Should().BeTrue();

        var branches = await db.ClinicBranches.Where(b => b.ClinicId == clinic.Id).ToListAsync();
        branches.Should().HaveCount(request.Branches.Count);
        branches.Should().Contain(b => b.City == "Prishtinë" && b.Name == request.Branches[0].Name);
    }

    [Fact]
    public async Task RegisterClinic_SupportsMoreThanOneBranch()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest() with
        {
            Branches =
            [
                NewBranch("Dega Qendër", "Prishtinë"),
                NewBranch("Dega Jugore", "Prizren")
            ]
        };

        var registration = await RegisterClinicAsync(client, request);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        var cities = await db.ClinicBranches
            .Where(b => b.ClinicId == registration.ClinicId)
            .Select(b => b.City)
            .ToListAsync();

        cities.Should().BeEquivalentTo(["Prishtinë", "Prizren"]);
    }

    [Fact]
    public async Task RegisterClinic_FailureAfterUserCreation_LeavesNothingBehind()
    {
        // Qyteti tejkalon kolonën (100 karaktere) — dështimi ndodh te SaveChanges i
        // klinikës/degëve, PASI Identity-a e ka shkruar tashmë user-in. Kërkesa niset
        // drejt shërbimit, jo drejt HTTP-së: validatori do ta ndalte më herët dhe
        // transaksioni s'do të provohej kurrë.
        var request = NewClinicRequest() with { Branches = [NewBranch("Dega", new string('x', 150))] };

        using var scope = _factory.Services.CreateScope();
        var authService = scope.ServiceProvider.GetRequiredService<IAuthService>();

        var act = async () => await authService.RegisterClinicAsync(request);

        await act.Should().ThrowAsync<DbUpdateException>();

        // I njëjti scope mban DbContext-in që u rrëzua, prandaj verifikimi bëhet me një të ri.
        using var verifyScope = _factory.Services.CreateScope();
        var db = verifyScope.ServiceProvider.GetRequiredService<BookingDbContext>();

        (await db.Users.AnyAsync(u => u.Email == request.Email)).Should().BeFalse();
        (await db.Clinics.AnyAsync(c => c.Name == request.ClinicName)).Should().BeFalse();
        (await db.ClinicBranches.AnyAsync(b => b.Name == "Dega" && b.City.StartsWith("xxx"))).Should().BeFalse();
    }

    [Fact]
    public async Task RegisterClinic_DuplicateAccountHolderEmail_Returns409()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest();
        await RegisterClinicAsync(client, request);

        // Klinikë tjetër, i njëjti mbajtës llogarie.
        var second = NewClinicRequest() with { Email = request.Email };
        var response = await client.PostAsJsonAsync("/api/auth/register-clinic", second, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task RegisterClinic_DuplicateClinicName_IsAllowed()
    {
        // Emri i njëjtë në qytete të ndryshme është realitet, jo gabim — porta është aprovimi.
        var client = _factory.CreateClient();
        var first = NewClinicRequest();
        await RegisterClinicAsync(client, first);

        var second = NewClinicRequest() with { ClinicName = first.ClinicName };
        var registration = await RegisterClinicAsync(client, second);

        registration.ClinicName.Should().Be(first.ClinicName);
    }

    [Fact]
    public async Task RegisterClinic_WithoutBranches_Returns422()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest() with { Branches = [] };

        var response = await client.PostAsJsonAsync("/api/auth/register-clinic", request, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task RegisterClinic_WithIncompleteBranch_Returns422()
    {
        // Degët janë të ndërfutura — provon që RuleForEach lidhet vërtet.
        var client = _factory.CreateClient();
        var request = NewClinicRequest() with { Branches = [NewBranch("Dega", city: "")] };

        var response = await client.PostAsJsonAsync("/api/auth/register-clinic", request, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    // ---------- Dukshmëria publike ----------

    [Fact]
    public async Task NewClinic_IsHiddenFromPublicSearchUntilApproved()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest();
        var registration = await RegisterClinicAsync(client, request);

        (await PublicSearchFindsAsync(client, request.ClinicName)).Should().BeFalse();

        var details = await client.GetAsync($"/api/clinics/{registration.ClinicId}");
        details.StatusCode.Should().Be(HttpStatusCode.NotFound);

        await ApproveAsync(registration.ClinicId);

        (await PublicSearchFindsAsync(client, request.ClinicName)).Should().BeTrue();
        (await client.GetAsync($"/api/clinics/{registration.ClinicId}"))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ---------- Çfarë mund të bëjë një ClinicAdmin në pritje ----------

    [Fact]
    public async Task PendingClinicAdmin_SeesOwnClinicAsPending()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest();
        var registration = await RegisterClinicAsync(client, request);
        client.WithToken(registration.Auth.AccessToken);

        var clinics = await client.GetFromJsonAsync<List<AdminClinicDto>>("/api/admin/clinics", TestHelpers.Json);

        clinics.Should().ContainSingle(c => c.Id == registration.ClinicId)
            .Which.IsApproved.Should().BeFalse();
    }

    [Fact]
    public async Task PendingClinicAdmin_CannotAddBranchesOrServices()
    {
        var client = _factory.CreateClient();
        var registration = await RegisterClinicAsync(client, NewClinicRequest());
        client.WithToken(registration.Auth.AccessToken);

        var branch = await client.PostAsJsonAsync(
            $"/api/admin/clinics/{registration.ClinicId}/branches",
            new CreateBranchRequest { Name = "Dega e dytë", Address = "Rr. e Dytë 2", City = "Prishtinë" },
            TestHelpers.Json);

        branch.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task ApprovedClinicAdmin_CanAddBranches()
    {
        var client = _factory.CreateClient();
        var registration = await RegisterClinicAsync(client, NewClinicRequest());
        await ApproveAsync(registration.ClinicId);
        client.WithToken(registration.Auth.AccessToken);

        var branch = await client.PostAsJsonAsync(
            $"/api/admin/clinics/{registration.ClinicId}/branches",
            new CreateBranchRequest { Name = "Dega e dytë", Address = "Rr. e Dytë 2", City = "Prishtinë" },
            TestHelpers.Json);

        branch.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    // ---------- Njoftimet ----------

    [Fact]
    public async Task RegisterClinic_NotifiesEverySuperAdmin()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest();
        var registration = await RegisterClinicAsync(client, request);

        var inbox = await DevEmailsAsync(client, DbSeeder.SuperAdminEmail);

        var notification = inbox.FirstOrDefault(e => e.TextBody.Contains(registration.ClinicId.ToString()));
        notification.Should().NotBeNull("SuperAdmin duhet të njoftohet për çdo klinikë të re");
        notification!.Subject.Should().Contain("aprovim");
        notification.TextBody.Should().Contain(request.ClinicName);
        notification.TextBody.Should().Contain(request.ClinicPhoneNumber);
        notification.TextBody.Should().Contain(request.Email);
        notification.TextBody.Should().Contain("Prishtinë");
    }

    [Fact]
    public async Task RegisterClinic_ConfirmsToTheNewClinicAdmin()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest();
        await RegisterClinicAsync(client, request);

        var inbox = await DevEmailsAsync(client, request.Email);

        var confirmation = inbox.FirstOrDefault(e => e.TextBody.Contains(request.ClinicName));
        confirmation.Should().NotBeNull("mbajtësi i llogarisë duhet të marrë konfirmim");
        confirmation!.TextBody.Should().Contain("rishikim");
    }

    [Fact]
    public async Task RegisterClinic_SendsAnEmailConfirmationToken()
    {
        // Pa këtë, në production (RequireConfirmedEmail=true) mbajtësi i llogarisë
        // s'do të rikyçej dot kurrë pas sesionit të parë.
        var client = _factory.CreateClient();
        var request = NewClinicRequest();
        await RegisterClinicAsync(client, request);

        var inbox = await DevEmailsAsync(client, request.Email);

        inbox.Should().Contain(e =>
            e.TextBody.Contains("/konfirmo-email?") && e.TextBody.Contains("token=") && e.TextBody.Contains(Uri.EscapeDataString(request.Email)));
    }

    [Fact]
    public async Task ApprovingClinic_NotifiesItsAdministrators()
    {
        var client = _factory.CreateClient();
        var request = NewClinicRequest();
        var registration = await RegisterClinicAsync(client, request);

        await ApproveAsync(registration.ClinicId);

        var inbox = await DevEmailsAsync(client, request.Email);
        inbox.Should().Contain(e => e.Subject.Contains("aprovua") && e.TextBody.Contains(request.ClinicName));
    }

    // ---------- Regresion: rruga e pacientit ----------

    [Fact]
    public async Task PatientRegistration_StillCreatesOnlyAPatient()
    {
        var client = _factory.CreateClient();
        var email = $"pacient-i-paprekur-{Guid.NewGuid():N}@test.dev";

        var auth = await TestHelpers.RegisterPatientAsync(client, email);

        auth.Roles.Should().BeEquivalentTo(["Patient"]);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();

        (await db.PatientProfiles.AnyAsync(p => p.UserId == auth.UserId)).Should().BeTrue();
        (await db.ClinicAdministrators.AnyAsync(a => a.UserId == auth.UserId)).Should().BeFalse();
    }

    // ---------- Ndihmësa ----------

    private static RegisterClinicRequest NewClinicRequest() => new()
    {
        FirstName = "Drilon",
        LastName = "Krasniqi",
        Email = $"klinika-admin-{Guid.NewGuid():N}@test.dev",
        PhoneNumber = "+383 44 111 222",
        Password = BookingApiFactory.DefaultUserPassword,
        ClinicName = $"Poliklinika Testuese {Guid.NewGuid():N}",
        Description = "Klinikë e krijuar nga testi i integrimit.",
        ClinicPhoneNumber = "+383 38 111 222",
        ClinicEmail = "kontakt@poliklinika-testuese.dev",
        Website = "https://poliklinika-testuese.dev",
        Branches = [NewBranch("Dega Qendër", "Prishtinë")]
    };

    private static RegisterClinicBranchRequest NewBranch(string name, string city) => new()
    {
        Name = name,
        Address = "Rr. Testuese 1",
        City = city,
        Municipality = null,
        PhoneNumber = "+383 38 111 333"
    };

    private static async Task<RegisterClinicResponse> RegisterClinicAsync(
        HttpClient client, RegisterClinicRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/auth/register-clinic", request, TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<RegisterClinicResponse>(TestHelpers.Json))!;
    }

    private async Task ApproveAsync(Guid clinicId)
    {
        var superAdmin = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(
            superAdmin, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword);
        superAdmin.WithToken(auth.AccessToken);

        var response = await superAdmin.PostAsync($"/api/admin/clinics/{clinicId}/approve", content: null);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    private static async Task<bool> PublicSearchFindsAsync(HttpClient client, string clinicName)
    {
        var results = await client.GetFromJsonAsync<PagedResult<ClinicDto>>(
            $"/api/clinics?searchTerm={Uri.EscapeDataString(clinicName)}", TestHelpers.Json);

        return results!.Items.Any(c => c.Name == clinicName);
    }

    private static async Task<IReadOnlyList<DevEmail>> DevEmailsAsync(HttpClient client, string toEmail) =>
        (await client.GetFromJsonAsync<List<DevEmail>>(
            $"/api/dev/emails?toEmail={Uri.EscapeDataString(toEmail)}", TestHelpers.Json))!;
}
