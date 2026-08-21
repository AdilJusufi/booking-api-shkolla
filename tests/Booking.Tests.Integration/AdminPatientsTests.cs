using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Auth;
using Booking.Domain.Enums;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using Xunit;

namespace Booking.Tests.Integration;

[Collection("api")]
public class AdminPatientsTests
{
    private readonly BookingApiFactory _factory;

    public AdminPatientsTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> ClinicAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword);
        return client.WithToken(auth.AccessToken);
    }

    private static AdminCreatePatientRequest NewPatient(
        string firstName, string lastName, string phone, string? email = null) => new()
    {
        FirstName = firstName,
        LastName = lastName,
        PhoneNumber = phone,
        Email = email,
        DateOfBirth = new DateOnly(1988, 4, 12),
        Gender = Gender.Female,
        Address = null,
        City = "Prishtinë"
    };

    private static async Task<AdminPatientDto> CreatePatientAsync(HttpClient client, AdminCreatePatientRequest request)
    {
        var response = await client.PostAsJsonAsync("/api/admin/patients", request, TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<AdminPatientDto>(TestHelpers.Json))!;
    }

    private static async Task<PagedResult<AdminPatientSearchResultDto>> SearchAsync(HttpClient client, string query)
    {
        var response = await client.GetAsync($"/api/admin/patients/search?query={Uri.EscapeDataString(query)}");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<PagedResult<AdminPatientSearchResultDto>>(TestHelpers.Json))!;
    }

    /// <summary>Numër unik për çdo test — telefoni është çelësi i dublikatave.</summary>
    private static string UniquePhone() => $"+383 44 {Random.Shared.Next(100, 999)} {Random.Shared.Next(100, 999)}";

    /// <summary>
    /// User i futur direkt në bazë, pa UserManager — pikërisht që të testohet
    /// mbrojtja e databazës e jo kontrolli i kodit. UserName-i mbetet unik me qëllim,
    /// që përplasja e vetme e mundshme të jetë ajo e email-it.
    /// </summary>
    private static ApplicationUser NewUser(string email) => new()
    {
        UserName = $"{Guid.NewGuid():N}",
        NormalizedUserName = $"{Guid.NewGuid():N}".ToUpperInvariant(),
        Email = email,
        NormalizedEmail = email.ToUpperInvariant(),
        FirstName = "Direkt",
        LastName = "NëBazë",
        CreatedAt = DateTime.UtcNow
    };

    // ---------- Kërkimi ----------

    [Fact]
    public async Task Search_ByExactEmail_FindsPatient()
    {
        var client = await ClinicAdminClientAsync();
        var email = $"gjetje-{Guid.NewGuid():N}@test.dev";
        var created = await CreatePatientAsync(client, NewPatient("Arta", "Kërkimi", UniquePhone(), email));

        var result = await SearchAsync(client, email);

        result.Items.Should().ContainSingle()
            .Which.PatientProfileId.Should().Be(created.PatientProfileId);
    }

    [Fact]
    public async Task Search_ByPhoneNumber_FindsPatient_EvenWhenFormattingDiffers()
    {
        var client = await ClinicAdminClientAsync();
        var phone = "+383 44 765 432";
        var created = await CreatePatientAsync(client, NewPatient("Blerim", "Telefoni", phone));

        // Recepsioni e shkruan numrin ndryshe nga si u ruajt — prapë duhet gjetur.
        var result = await SearchAsync(client, "044-765-432");

        result.Items.Should().ContainSingle()
            .Which.PatientProfileId.Should().Be(created.PatientProfileId);
    }

    [Fact]
    public async Task Search_ByName_ExcludesPatientsWithNoRelationshipToMyClinic()
    {
        var client = await ClinicAdminClientAsync();
        var surname = $"Panjohur{Guid.NewGuid():N}"[..20];
        await CreatePatientAsync(client, NewPatient("Driton", surname, UniquePhone()));

        // Pacienti sapo u krijua dhe s'ka asnjë termin — kërkimi me emër është i
        // kufizuar te pacientët e klinikës, prandaj nuk duhet të dalë fare.
        var result = await SearchAsync(client, surname);

        result.Items.Should().BeEmpty();
    }

    [Fact]
    public async Task Search_ByName_FindsPatientOnceTheyHaveAnAppointmentAtMyClinic()
    {
        var client = await ClinicAdminClientAsync();
        var surname = $"Njohur{Guid.NewGuid():N}"[..18];
        var created = await CreatePatientAsync(client, NewPatient("Elira", surname, UniquePhone()));

        await BookAsync(client, created.PatientProfileId, new TimeOnly(8, 30));

        var result = await SearchAsync(client, surname);

        var match = result.Items.Should().ContainSingle().Subject;
        match.PatientProfileId.Should().Be(created.PatientProfileId);
        match.HasRelationshipWithClinic.Should().BeTrue();
        // Pacienti tani i përket klinikës → detajet vijnë të plota.
        match.DateOfBirth.Should().NotBeNull();
        match.PhoneNumber.Should().NotBeNull();
    }

    [Fact]
    public async Task Search_ByEmail_ForUnrelatedPatient_ReturnsReducedDetail()
    {
        var client = await ClinicAdminClientAsync();
        var email = $"pareduktuar-{Guid.NewGuid():N}@test.dev";
        await CreatePatientAsync(client, NewPatient("Fatmire", "Reduktimi", UniquePhone(), email));

        var result = await SearchAsync(client, email);

        var match = result.Items.Should().ContainSingle().Subject;
        match.HasRelationshipWithClinic.Should().BeFalse();
        // Identifikuesi i kërkuar kthehet — admini tashmë e dinte.
        match.Email.Should().Be(email);
        // Gjithçka tjetër mbahet: kontakti tjetër, datëlindja, dependentët.
        match.PhoneNumber.Should().BeNull();
        match.DateOfBirth.Should().BeNull();
        match.Dependents.Should().BeEmpty();
    }

    [Fact]
    public async Task Search_WithQueryShorterThanThreeCharacters_IsRejected()
    {
        var client = await ClinicAdminClientAsync();

        var response = await client.GetAsync("/api/admin/patients/search?query=ab");

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task Search_NeverReturnsPersonalNumber()
    {
        var client = await ClinicAdminClientAsync();
        var email = $"personal-{Guid.NewGuid():N}@test.dev";
        var created = await CreatePatientAsync(client, NewPatient("Gentiana", "Ndjeshme", UniquePhone(), email));

        // PersonalNumber s'pranohet nga API-ja fare, prandaj vendoset direkt në bazë
        // për ta provuar që projeksioni i kërkimit nuk e nxjerr kurrë.
        const string personalNumber = "1234567890";
        using (var scope = _factory.Services.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
            var profile = await db.PatientProfiles.FirstAsync(p => p.Id == created.PatientProfileId);
            profile.PersonalNumber = personalNumber;
            await db.SaveChangesAsync();
        }

        var raw = await client.GetStringAsync($"/api/admin/patients/search?query={Uri.EscapeDataString(email)}");

        raw.Should().NotContain(personalNumber);
        raw.Should().NotContain("personalNumber");
    }

    [Fact]
    public async Task Search_IsDeniedToPatients()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.PatientEmail, BookingApiFactory.DefaultUserPassword);
        client.WithToken(auth.AccessToken);

        var response = await client.GetAsync("/api/admin/patients/search?query=testi");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Search_IsRecordedInTheAuditLog()
    {
        var admin = await ClinicAdminClientAsync();
        var email = $"audit-{Guid.NewGuid():N}@test.dev";
        await CreatePatientAsync(admin, NewPatient("Hana", "Auditimi", UniquePhone(), email));
        await SearchAsync(admin, email);

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        // NewValues është kolonë jsonb: filtrimi me Contains do të përkthehej në LIKE
        // mbi jsonb dhe Postgres-i s'e ka atë operator. Prandaj termi kërkohet në memorie.
        var payloads = await db.AuditLogs
            .Where(l => l.Action == "PATIENT_SEARCHED_BY_ADMIN")
            .Select(l => l.NewValues)
            .ToListAsync();

        payloads.Should().Contain(p => p != null && p.Contains(email));
    }

    // ---------- Krijimi ----------

    [Fact]
    public async Task CreatePatient_WithoutEmail_Succeeds_AndAccountIsUnclaimed()
    {
        var client = await ClinicAdminClientAsync();

        // Rasti kryesor: thirrësi në telefon që s'ka fare email.
        var created = await CreatePatientAsync(client, NewPatient("Ilir", "PaEmail", UniquePhone()));

        created.Email.Should().BeNull();
        created.PatientProfileId.Should().NotBeEmpty();
        created.IsUnclaimedAccount.Should().BeTrue();
    }

    [Fact]
    public async Task CreatePatient_WithDuplicatePhone_Returns409()
    {
        var client = await ClinicAdminClientAsync();
        var phone = UniquePhone();
        await CreatePatientAsync(client, NewPatient("Jeta", "Dublikat", phone));

        var response = await client.PostAsJsonAsync("/api/admin/patients",
            NewPatient("Jeta", "DublikatSërish", phone), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task CreatePatient_WithDuplicateEmail_Returns409()
    {
        var client = await ClinicAdminClientAsync();
        var email = $"dublikat-{Guid.NewGuid():N}@test.dev";
        await CreatePatientAsync(client, NewPatient("Kushtrim", "Email", UniquePhone(), email));

        var response = await client.PostAsJsonAsync("/api/admin/patients",
            NewPatient("Kushtrim", "EmailSërish", UniquePhone(), email), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task SelfRegistration_StillRejectsDuplicateEmail()
    {
        // Mbrojtje për heqjen e Identity.RequireUniqueEmail: uniciteti tani mbahet
        // nga kodi ynë, kështu që ky test duhet të mbetet i gjelbër.
        var client = _factory.CreateClient();
        var email = $"unik-{Guid.NewGuid():N}@test.dev";
        var request = new RegisterRequest(
            "Luan", "Unik", email, "+383 44 321 321", BookingApiFactory.DefaultUserPassword,
            new DateOnly(1991, 1, 1), Gender.Male, null, "Prishtinë");

        var first = await client.PostAsJsonAsync("/api/auth/register", request, TestHelpers.Json);
        first.StatusCode.Should().Be(HttpStatusCode.Created);

        var second = await client.PostAsJsonAsync("/api/auth/register", request, TestHelpers.Json);
        second.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task DuplicateEmail_IsAlsoBlockedByTheDatabase()
    {
        // Kontrolli në kod është "lexo pastaj shkruaj" dhe s'e kap dot garën mes dy
        // kërkesave paralele. Indeksi unik i pjesshëm mbi NormalizedEmail e mbyll atë.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        var email = $"gare-{Guid.NewGuid():N}@test.dev";

        db.Users.Add(NewUser(email));
        await db.SaveChangesAsync();

        db.Users.Add(NewUser(email));
        var act = () => db.SaveChangesAsync();

        var thrown = await act.Should().ThrowAsync<DbUpdateException>();
        thrown.Which.InnerException.Should().BeOfType<PostgresException>()
            .Which.SqlState.Should().Be("23505");
    }

    [Fact]
    public async Task SeveralPatientsWithoutEmail_CanCoexist()
    {
        // Indeksi është i PJESSHËM me qëllim: pacienti i krijuar me telefon shpesh
        // s'ka email, dhe disa NULL-e nuk duhet të përplasen me njëri-tjetrin.
        var client = await ClinicAdminClientAsync();

        var first = await CreatePatientAsync(client, NewPatient("Agon", "PaEmail", UniquePhone()));
        var second = await CreatePatientAsync(client, NewPatient("Besa", "PaEmail", UniquePhone()));

        first.Email.Should().BeNull();
        second.Email.Should().BeNull();
        second.PatientProfileId.Should().NotBe(first.PatientProfileId);
    }

    // ---------- Ura drejt rezervimit (Pjesa 3) ----------

    [Fact]
    public async Task CreatedPatient_CanBeBookedByPatientProfileId()
    {
        var client = await ClinicAdminClientAsync();
        // Pa email — pikërisht pacienti që rruga e vjetër me patientEmail s'e mbulon dot.
        var created = await CreatePatientAsync(client, NewPatient("Mirlinda", "Rezervim", UniquePhone()));

        var response = await BookAsync(client, created.PatientProfileId, new TimeOnly(9, 30));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var appointment = await response.Content.ReadFromJsonAsync<DoctorAppointmentDto>(TestHelpers.Json);
        appointment!.PatientName.Should().Be("Mirlinda Rezervim");
    }

    [Fact]
    public async Task CreateAppointment_WithNeitherPatientIdentifier_IsRejected()
    {
        var client = await ClinicAdminClientAsync();

        var response = await client.PostAsJsonAsync("/api/admin/appointments", new AdminCreateAppointmentRequest
        {
            PatientProfileId = null,
            PatientEmail = null,
            DoctorId = DbSeeder.Ids.DoctorBlerta,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = TestHelpers.NextMonday().ToDateTime(new TimeOnly(10, 0))
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task CreateAppointment_ByPatientEmail_StillWorks()
    {
        // Pajtueshmëri prapa: rruga e vjetër me email nuk u prish.
        var client = await ClinicAdminClientAsync();
        var email = $"prapa-{Guid.NewGuid():N}@test.dev";
        await CreatePatientAsync(client, NewPatient("Nora", "Pajtueshmeri", UniquePhone(), email));

        var response = await client.PostAsJsonAsync("/api/admin/appointments", new AdminCreateAppointmentRequest
        {
            PatientEmail = email,
            DoctorId = DbSeeder.Ids.DoctorBlerta,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = NextTuesday().ToDateTime(new TimeOnly(11, 0))
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    // ---------- Ndihmës ----------

    /// <summary>E martë brenda orarit të seed-uar (Hën–Pre), larg testeve të tjera.</summary>
    private static DateOnly NextTuesday() => TestHelpers.NextMonday().AddDays(1);

    private static Task<HttpResponseMessage> BookAsync(HttpClient client, Guid patientProfileId, TimeOnly time) =>
        client.PostAsJsonAsync("/api/admin/appointments", new AdminCreateAppointmentRequest
        {
            PatientProfileId = patientProfileId,
            DoctorId = DbSeeder.Ids.DoctorBlerta,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = NextTuesday().ToDateTime(time)
        }, TestHelpers.Json);
}
