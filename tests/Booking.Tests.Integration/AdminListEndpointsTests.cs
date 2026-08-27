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

        // pageSize=100 është maksimumi i lejuar nga AdminAppointmentsQueryValidator.
        var response = await client.GetAsync("/api/admin/appointments?pageSize=100");

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

    /// <summary>
    /// Kontrollohet JSON-i i papërpunuar, jo DTO-ja: deserializimi te AdminUserDto
    /// do t'i hidhte fushat e tepërta pa u vënë re. Pikërisht ato po i kërkojmë.
    /// </summary>
    [Fact]
    public async Task Users_DoNotLeakIdentityInternalsOrPersonalNumber()
    {
        var client = await SuperAdminClientAsync();

        var response = await client.GetAsync("/api/admin/users?pageSize=100");
        var raw = await response.Content.ReadAsStringAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        raw.Should().NotBeEmpty();
        foreach (var forbidden in new[]
                 {
                     "passwordHash", "securityStamp", "concurrencyStamp",
                     "personalNumber", "twoFactorEnabled", "lockoutEnd", "accessFailedCount"
                 })
        {
            raw.Should().NotContainEquivalentOf(forbidden);
        }
    }

    [Fact]
    public async Task Users_Listing_IsAuditLogged()
    {
        var client = await SuperAdminClientAsync();

        await client.GetAsync("/api/admin/users?role=Doctor&search=zz-audit-probe");

        var response = await client.GetAsync("/api/admin/audit-logs?pageSize=50");
        var page = await response.Content.ReadFromJsonAsync<PagedResult<AuditLogDto>>(TestHelpers.Json);

        var entry = page!.Items.Should()
            .ContainSingle(l => l.Action == "USERS_LISTED_BY_SUPERADMIN"
                                && l.NewValues != null
                                && l.NewValues.Contains("zz-audit-probe"))
            .Subject;

        entry.UserEmail.Should().Be(DbSeeder.SuperAdminEmail);
        // Filtrat auditohen, rreshtat jo — audit log-u s'bëhet bazë e dytë e të dhënave personale.
        entry.NewValues.Should().NotContainEquivalentOf(DbSeeder.SuperAdminEmail);
    }

    // ---------- Kufijtë e pagination-it ----------

    [Theory]
    [InlineData("/api/admin/appointments?pageSize=101")]
    [InlineData("/api/admin/appointments?pageSize=0")]
    [InlineData("/api/admin/appointments?page=0")]
    public async Task Appointments_RejectsOutOfRangePaging(string url)
    {
        var client = await ClinicAdminClientAsync();

        var response = await client.GetAsync(url);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Theory]
    [InlineData("/api/admin/users?pageSize=101")]
    [InlineData("/api/admin/users?pageSize=0")]
    [InlineData("/api/admin/users?page=0")]
    public async Task Users_RejectsOutOfRangePaging(string url)
    {
        var client = await SuperAdminClientAsync();

        var response = await client.GetAsync(url);

        response.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
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

    /// <summary>Çdo zbërthim duhet të mbledhë saktësisht totalin — numërime dhe të ardhura.</summary>
    [Fact]
    public async Task Report_Breakdowns_SumToOverallTotals()
    {
        var admin = await ClinicAdminClientAsync();
        var report = await ReportAsync(admin, WideFrom, WideTo);

        report.ByStatus.Values.Sum().Should().Be(report.TotalAppointments);
        report.ByDoctor.Sum(d => d.AppointmentCount).Should().Be(report.TotalAppointments);
        report.ByBranch.Sum(b => b.AppointmentCount).Should().Be(report.TotalAppointments);
        report.ByService.Sum(s => s.AppointmentCount).Should().Be(report.TotalAppointments);

        report.ByDoctor.Sum(d => d.Revenue).Should().Be(report.TotalRevenue);
        report.ByBranch.Sum(b => b.Revenue).Should().Be(report.TotalRevenue);
        report.ByService.Sum(s => s.Revenue).Should().Be(report.TotalRevenue);

        report.ByDoctor.Sum(d => d.CompletedCount).Should().Be(report.CompletedAppointments);
        report.ByDoctor.Sum(d => d.CancelledCount).Should().Be(report.CancelledAppointments);
        report.ByDoctor.Sum(d => d.NoShowCount).Should().Be(report.NoShowAppointments);

        (report.CompletedAppointments + report.CancelledAppointments + report.NoShowAppointments)
            .Should().BeLessThanOrEqualTo(report.TotalAppointments);
    }

    /// <summary>Interval pa asnjë termin → zero kudo, jo gabim dhe jo null.</summary>
    [Fact]
    public async Task Report_EmptyRange_ReturnsZerosNotError()
    {
        var admin = await ClinicAdminClientAsync();

        var report = await ReportAsync(admin, new DateOnly(2000, 1, 1), new DateOnly(2000, 1, 31));

        report.TotalAppointments.Should().Be(0);
        report.CompletedAppointments.Should().Be(0);
        report.CancelledAppointments.Should().Be(0);
        report.NoShowAppointments.Should().Be(0);
        report.TotalRevenue.Should().Be(0m);
        report.ByStatus.Should().BeEmpty();
        report.ByDoctor.Should().BeEmpty();
        report.ByBranch.Should().BeEmpty();
        report.ByService.Should().BeEmpty();

        // Pa të ardhura valuta bie te lista e çmimeve të klinikës — kurrë bosh.
        report.Currency.Should().NotBeNullOrWhiteSpace();
    }

    /// <summary>Interval i përmbysur (from > to) — po ashtu zero, jo gabim.</summary>
    [Fact]
    public async Task Report_InvertedRange_ReturnsZerosNotError()
    {
        var admin = await ClinicAdminClientAsync();

        var report = await ReportAsync(admin, WideTo, WideFrom);

        report.TotalAppointments.Should().Be(0);
        report.TotalRevenue.Should().Be(0m);
    }

    /// <summary>
    /// Terminet e parezervuara nuk sjellin të ardhura: një termin i sapo-krijuar (Pending)
    /// rrit totalin, por të ardhurat mbeten të pandryshuara — zero, jo null.
    /// </summary>
    [Fact]
    public async Task Report_UncompletedAppointment_AddsNoRevenue()
    {
        var admin = await ClinicAdminClientAsync();
        var before = await ReportAsync(admin, WideFrom, WideTo);

        // Orari i seed-uar: 08:00–12:00 dhe 13:00–17:00, slote 30-minutëshe.
        await BookAppointmentAtDardaniaAsync(new TimeOnly(14, 30));

        var after = await ReportAsync(admin, WideFrom, WideTo);

        after.TotalAppointments.Should().Be(before.TotalAppointments + 1);
        after.TotalRevenue.Should().Be(before.TotalRevenue);
        after.CompletedAppointments.Should().Be(before.CompletedAppointments);
    }

    /// <summary>
    /// Pa override, të ardhurat duhet të ndjekin MedicalService.Price — ana tjetër e
    /// çiftit me testin e CustomPrice më poshtë.
    /// </summary>
    [Fact]
    public async Task Report_Revenue_FallsBackToServicePriceWithoutOverride()
    {
        var appointmentId = await BookAppointmentAtDardaniaAsync(new TimeOnly(16, 30));
        var admin = await ClinicAdminClientAsync();
        var before = await ReportAsync(admin, WideFrom, WideTo);

        await CompleteAsync(admin, appointmentId);

        var after = await ReportAsync(admin, WideFrom, WideTo);

        AssertRevenueDelta(before, after, DentalCleaningBasePrice);
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
        const decimal customPrice = 99.50m;

        var appointmentId = await BookAppointmentAtDardaniaAsync(new TimeOnly(16, 0));
        var admin = await ClinicAdminClientAsync();

        await SetCustomPriceAsync(customPrice);
        try
        {
            var before = await ReportAsync(admin, WideFrom, WideTo);
            await CompleteAsync(admin, appointmentId);
            var after = await ReportAsync(admin, WideFrom, WideTo);

            AssertRevenueDelta(before, after, customPrice);

            // Çmimi bazë raportohet ende si referencë, i pandikuar nga override-i.
            after.ByService.Single(s => s.ServiceId == DbSeeder.Ids.ServiceDentalCleaning)
                .Price.Should().Be(DentalCleaningBasePrice);
        }
        finally
        {
            await SetCustomPriceAsync(null);
        }
    }

    /// <summary>Pastrim i dhëmbëve — çmimi bazë sipas seed-it.</summary>
    private const decimal DentalCleaningBasePrice = 25m;

    private static DateOnly WideFrom => DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(-90);

    private static DateOnly WideTo => DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(90);

    private static async Task<ClinicReportDto> ReportAsync(HttpClient admin, DateOnly from, DateOnly to)
    {
        var response = await admin.GetAsync(
            $"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/report?from={from:yyyy-MM-dd}&to={to:yyyy-MM-dd}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<ClinicReportDto>(TestHelpers.Json))!;
    }

    /// <summary>Pending → Confirmed → Completed (kalimi i drejtpërdrejtë nuk lejohet).</summary>
    private static async Task CompleteAsync(HttpClient admin, Guid appointmentId)
    {
        await TransitionAsync(admin, appointmentId, AppointmentStatus.Confirmed);
        await TransitionAsync(admin, appointmentId, AppointmentStatus.Completed);
    }

    /// <summary>
    /// Krahasim me diferencë, jo me vlerë absolute: testet e klasës ndajnë të njëjtën DB
    /// dhe të njëjtën datë rezervimi, prandaj një total absolut do të varej nga radha e ekzekutimit.
    /// </summary>
    private static void AssertRevenueDelta(ClinicReportDto before, ClinicReportDto after, decimal expectedRevenue)
    {
        after.CompletedAppointments.Should().Be(before.CompletedAppointments + 1);
        after.TotalRevenue.Should().Be(before.TotalRevenue + expectedRevenue);

        RevenueOf(after.ByService, s => s.ServiceId == DbSeeder.Ids.ServiceDentalCleaning, s => s.Revenue)
            .Should().Be(RevenueOf(before.ByService, s => s.ServiceId == DbSeeder.Ids.ServiceDentalCleaning, s => s.Revenue)
                + expectedRevenue);

        RevenueOf(after.ByDoctor, d => d.DoctorId == DbSeeder.Ids.DoctorArben, d => d.Revenue)
            .Should().Be(RevenueOf(before.ByDoctor, d => d.DoctorId == DbSeeder.Ids.DoctorArben, d => d.Revenue)
                + expectedRevenue);

        RevenueOf(after.ByBranch, b => b.BranchId == DbSeeder.Ids.BranchDardania, b => b.Revenue)
            .Should().Be(RevenueOf(before.ByBranch, b => b.BranchId == DbSeeder.Ids.BranchDardania, b => b.Revenue)
                + expectedRevenue);
    }

    /// <summary>Rreshti mund të mos ekzistojë ende në raportin "para" — atëherë 0.</summary>
    private static decimal RevenueOf<T>(
        IReadOnlyList<T> rows, Func<T, bool> predicate, Func<T, decimal> revenue) =>
        rows.Where(predicate).Select(revenue).SingleOrDefault();

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
        messages!.Single().TextBody.Should().Contain("/konfirmo-email?").And.Contain("token=");
    }
}
