using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Models;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Domain.Enums;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Endpoint-et e reja të listimit administrativ. Testet ekzekutohen mbi PostgreSQL
/// real (Testcontainers) — kjo është e rëndësishme sepse verifikojnë se filtrat
/// (sidomos kërkimi mbi ID e terminit) përkthehen vërtet në SQL.
/// </summary>
[Collection("api")]
public class AdminListEndpointsTests
{
    private readonly BookingApiFactory _factory;

    public AdminListEndpointsTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    private async Task<HttpClient> ClinicAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword);
        return client.WithToken(auth.AccessToken);
    }

    private async Task<HttpClient> SuperAdminClientAsync()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.LoginAsync(client, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword);
        return client.WithToken(auth.AccessToken);
    }

    // ---------- GET /api/admin/appointments ----------

    [Fact]
    public async Task Appointments_ReturnsPagedEnvelope()
    {
        var client = await ClinicAdminClientAsync();

        var response = await client.GetAsync("/api/admin/appointments");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AdminAppointmentListItemDto>>(TestHelpers.Json);
        page.Should().NotBeNull();
        page!.Page.Should().Be(1);
        page.Items.Should().NotBeNull();
    }

    /// <summary>Rezervon një termin real te Dardania që lista të ketë çfarë të kthejë.</summary>
    private async Task<Guid> BookAppointmentAtDardaniaAsync(TimeOnly time)
    {
        var patient = _factory.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);

        var response = await patient.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = DbSeeder.Ids.DoctorArben,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = TestHelpers.NextMonday().ToDateTime(time)
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var created = await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);
        return created!.Id;
    }

    [Fact]
    public async Task Appointments_ClinicAdmin_SeesOwnClinicRowsFullyDenormalized()
    {
        var appointmentId = await BookAppointmentAtDardaniaAsync(new TimeOnly(15, 0));
        var client = await ClinicAdminClientAsync();

        var response = await client.GetAsync("/api/admin/appointments?pageSize=200");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AdminAppointmentListItemDto>>(TestHelpers.Json);

        // Admini i seed-uar menaxhon vetëm Dardania — asnjë rresht nga Sunny.
        page!.Items.Should().NotBeEmpty();
        page.Items.Should().OnlyContain(i => i.ClinicId == DbSeeder.Ids.ClinicDardania);

        // Rreshti duhet të jetë i vizatueshëm pa asnjë kërkesë shtesë.
        var row = page.Items.Single(i => i.Id == appointmentId);
        row.PatientName.Should().NotBeNullOrWhiteSpace();
        row.DoctorName.Should().Be("Arben Gashi");
        row.ServiceName.Should().NotBeNullOrWhiteSpace();
        row.BranchName.Should().NotBeNullOrWhiteSpace();
        row.ClinicName.Should().NotBeNullOrWhiteSpace();
        row.DoctorSpecialty.Should().NotBeNullOrWhiteSpace();
        row.IsForDependent.Should().BeFalse();
        row.DependentName.Should().BeNull();
        row.Version.Should().NotBe(0);
    }

    [Fact]
    public async Task Appointments_SearchByIdFragment_FindsTheAppointment()
    {
        var appointmentId = await BookAppointmentAtDardaniaAsync(new TimeOnly(15, 30));
        var client = await ClinicAdminClientAsync();

        // Frontend-i shfaq vetëm prefiksin e ID-së — kërkimi duhet ta gjejë me të.
        var fragment = appointmentId.ToString()[..8];
        var response = await client.GetAsync($"/api/admin/appointments?search={fragment}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AdminAppointmentListItemDto>>(TestHelpers.Json);
        page!.Items.Should().ContainSingle(i => i.Id == appointmentId);
    }

    [Fact]
    public async Task Appointments_FilterByForeignClinic_ReturnsEmpty()
    {
        var client = await ClinicAdminClientAsync();

        var response = await client.GetAsync($"/api/admin/appointments?clinicId={DbSeeder.Ids.ClinicSunny}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AdminAppointmentListItemDto>>(TestHelpers.Json);
        page!.Items.Should().BeEmpty();
    }

    /// <summary>
    /// Kërkimi i lirë prek edhe ID e terminit (Guid.ToString() → cast në text).
    /// Nëse Npgsql nuk e përkthen dot, ky test dështon me 500 — prandaj ekziston.
    /// </summary>
    [Fact]
    public async Task Appointments_SearchIsTranslatedToSql()
    {
        var client = await ClinicAdminClientAsync();

        var byName = await client.GetAsync("/api/admin/appointments?search=pacient");
        byName.StatusCode.Should().Be(HttpStatusCode.OK);

        var byIdFragment = await client.GetAsync("/api/admin/appointments?search=a1b2c3");
        byIdFragment.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Appointments_AllFiltersCombined_AreTranslated()
    {
        var client = await ClinicAdminClientAsync();
        var from = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(-30);
        var to = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(30);

        var response = await client.GetAsync(
            $"/api/admin/appointments?doctorId={DbSeeder.Ids.DoctorArben}"
            + $"&clinicBranchId={DbSeeder.Ids.BranchDardania}"
            + $"&status=Pending&from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}&search=a&page=1&pageSize=10");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Appointments_Patient_IsForbidden()
    {
        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.RegisterPatientAsync(client)).AccessToken);

        var response = await client.GetAsync("/api/admin/appointments");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ---------- GET /api/admin/users ----------

    [Fact]
    public async Task Users_SuperAdmin_ReturnsPagedUsers()
    {
        var client = await SuperAdminClientAsync();

        var response = await client.GetAsync("/api/admin/users?pageSize=100");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AdminUserDto>>(TestHelpers.Json);
        page!.Items.Should().NotBeEmpty();
        page.Items.Should().Contain(u => u.Email == DbSeeder.SuperAdminEmail);
        page.Items.Should().OnlyContain(u => !string.IsNullOrWhiteSpace(u.FullName));
    }

    [Fact]
    public async Task Users_FilterByRole_ReturnsOnlyThatRole()
    {
        var client = await SuperAdminClientAsync();

        var response = await client.GetAsync("/api/admin/users?role=Doctor&pageSize=100");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AdminUserDto>>(TestHelpers.Json);
        page!.Items.Should().NotBeEmpty();
        page.Items.Should().OnlyContain(u => u.Roles.Contains("Doctor"));
    }

    [Fact]
    public async Task Users_SearchByEmail_Matches()
    {
        var client = await SuperAdminClientAsync();

        var response = await client.GetAsync($"/api/admin/users?search={DbSeeder.SuperAdminEmail}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AdminUserDto>>(TestHelpers.Json);
        page!.Items.Should().ContainSingle(u => u.Email == DbSeeder.SuperAdminEmail);
    }

    [Fact]
    public async Task Users_ClinicAdmin_IsForbidden()
    {
        var client = await ClinicAdminClientAsync();

        var response = await client.GetAsync("/api/admin/users");

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    // ---------- DTO-t e plotësuara ----------

    [Fact]
    public async Task AdminClinics_CarryAssignedAdministrators()
    {
        var client = await SuperAdminClientAsync();

        var response = await client.GetAsync("/api/admin/clinics");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var clinics = await response.Content.ReadFromJsonAsync<List<AdminClinicDto>>(TestHelpers.Json);

        var dardania = clinics!.Single(c => c.Id == DbSeeder.Ids.ClinicDardania);
        dardania.Administrators.Should().ContainSingle(a => a.Email == DbSeeder.ClinicAdminEmail);
    }

    [Fact]
    public async Task AuditLogs_CarryActorEmail()
    {
        var client = await SuperAdminClientAsync();

        // PUT-i e regjistron gjithmonë CLINIC_UPDATED — ndryshe nga /approve, që
        // është no-op (dhe pa audit log) kur klinika është tashmë e aprovuar.
        await client.PutAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}", new UpdateClinicRequest
        {
            Name = "Klinika Dentare Dardania",
            Description = "Audit trail test",
            PhoneNumber = "+383 44 111 111",
            Email = null,
            Website = null
        }, TestHelpers.Json);

        var response = await client.GetAsync("/api/admin/audit-logs?pageSize=50");
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AuditLogDto>>(TestHelpers.Json);

        page!.Items.Should().Contain(l => l.UserEmail == DbSeeder.SuperAdminEmail);
    }

    [Fact]
    public async Task Specialties_ExposeIsActive()
    {
        var client = _factory.CreateClient();

        var response = await client.GetAsync("/api/specialties");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var specialties = await response.Content
            .ReadFromJsonAsync<List<Booking.Application.Features.Clinics.SpecialtyDto>>(TestHelpers.Json);

        // Endpoint-i publik kthen vetëm aktivet — fusha tani ekziston dhe është true.
        specialties!.Should().NotBeEmpty();
        specialties.Should().OnlyContain(s => s.IsActive);
    }

    // ---------- Raporti ----------

    [Fact]
    public async Task Report_IncludesRevenueAndAggregations()
    {
        var client = await ClinicAdminClientAsync();
        var from = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(-90);
        var to = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(90);

        var response = await client.GetAsync(
            $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/report?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var report = await response.Content.ReadFromJsonAsync<ClinicReportDto>(TestHelpers.Json);

        report.Should().NotBeNull();
        report!.Currency.Should().NotBeNullOrWhiteSpace();
        report.TotalRevenue.Should().BeGreaterThanOrEqualTo(0);
        report.ByBranch.Should().NotBeNull();
        report.ByService.Should().NotBeNull();

        // Numërimet e përmbledhura duhet të përputhen me ByStatus.
        report.CompletedAppointments.Should().Be(
            report.ByStatus.TryGetValue("Completed", out var completed) ? completed : 0);

        // Totali i ByDoctor nuk mund ta kalojë totalin e termineve.
        report.ByDoctor.Sum(d => d.AppointmentCount).Should().Be(report.TotalAppointments);
        report.ByBranch.Sum(b => b.AppointmentCount).Should().Be(report.TotalAppointments);
    }

    /// <summary>
    /// Të ardhurat duhet të përdorin çmimin EFEKTIV: DoctorService.CustomPrice e
    /// mbivendos MedicalService.Price. Pa këtë, çdo doktor me override do të
    /// raportonte shifra të gabuara. Seed-i nuk ka CustomPrice, prandaj testi e
    /// vendos vetë dhe e rikthen në fund.
    /// </summary>
    [Fact]
    public async Task Report_Revenue_UsesDoctorCustomPriceOverride()
    {
        const decimal basePrice = 25m;      // Pastrim i dhëmbëve, sipas seed-it
        const decimal customPrice = 99.50m;

        var appointmentId = await BookAppointmentAtDardaniaAsync(new TimeOnly(16, 0));
        var admin = await ClinicAdminClientAsync();

        await SetCustomPriceAsync(customPrice);
        try
        {
            // Pending → Confirmed → Completed (kalim i drejtpërdrejtë nuk lejohet).
            await TransitionAsync(admin, appointmentId, AppointmentStatus.Confirmed);
            await TransitionAsync(admin, appointmentId, AppointmentStatus.Completed);

            var from = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(-1);
            var to = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(30);
            var response = await admin.GetAsync(
                $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/report?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}");

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var report = (await response.Content.ReadFromJsonAsync<ClinicReportDto>(TestHelpers.Json))!;

            var cleaning = report.ByService.Single(s => s.ServiceId == DbSeeder.Ids.ServiceDentalCleaning);

            // Çmimi bazë raportohet ende si referencë...
            cleaning.Price.Should().Be(basePrice);
            // ...por të ardhurat duhet të ndjekin override-in.
            cleaning.Revenue.Should().Be(customPrice);
            report.TotalRevenue.Should().Be(customPrice);
            report.CompletedAppointments.Should().Be(1);

            report.ByDoctor.Single(d => d.DoctorId == DbSeeder.Ids.DoctorArben)
                .Revenue.Should().Be(customPrice);
            report.ByBranch.Single(b => b.BranchId == DbSeeder.Ids.BranchDardania)
                .Revenue.Should().Be(customPrice);
        }
        finally
        {
            await SetCustomPriceAsync(null);
        }
    }

    private async Task SetCustomPriceAsync(decimal? price)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();

        var doctorService = await db.DoctorServices.SingleAsync(ds =>
            ds.DoctorId == DbSeeder.Ids.DoctorArben
            && ds.MedicalServiceId == DbSeeder.Ids.ServiceDentalCleaning);

        doctorService.CustomPrice = price;
        await db.SaveChangesAsync();
    }

    private static async Task TransitionAsync(HttpClient admin, Guid appointmentId, AppointmentStatus status)
    {
        var response = await admin.PutAsJsonAsync(
            $"/api/admin/appointments/{appointmentId}",
            new AdminUpdateAppointmentRequest { Status = status },
            TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    // ---------- Kutia postare e zhvillimit ----------

    [Fact]
    public async Task DevInbox_ExposesConfirmationToken()
    {
        var client = _factory.CreateClient();
        var email = $"dev-inbox-{Guid.NewGuid():N}@test.dev";

        await TestHelpers.RegisterPatientAsync(client, email);

        var response = await client.GetAsync($"/api/dev/emails?toEmail={Uri.EscapeDataString(email)}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var messages = await response.Content
            .ReadFromJsonAsync<List<Booking.Infrastructure.Notifications.DevEmail>>(TestHelpers.Json);

        messages.Should().ContainSingle();
        messages!.Single().Body.Should().Contain("Tokeni i konfirmimit");
    }
}
