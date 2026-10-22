using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Infrastructure.Notifications;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Rezervimi me telefon nga recepsioni (Pjesa 2): vetëm admini i klinikës pronare,
/// vetëm me slote të lira, i shënuar "rezervuar nga klinika", dhe pa email/gabim
/// kur pacienti s'ka email.
/// </summary>
[Collection("api")]
public class StaffBookingTests
{
    private readonly BookingApiFactory _factory;

    public StaffBookingTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task OwnerClinicAdmin_CanBook_AndTheAppointmentIsMarkedBookedByClinic()
    {
        var admin = await DardaniaAdminAsync();
        var patient = await CreatePatientAsync(admin, email: null);
        var start = Slot(new TimeOnly(9, 0));

        var response = await BookAsync(admin, patient.PatientProfileId, start);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var appointment = await response.Content.ReadFromJsonAsync<DoctorAppointmentDto>(TestHelpers.Json);
        appointment!.BookedByClinic.Should().BeTrue();
        appointment.StartDateTime.Should().Be(start);

        // Lista e adminit e tregon gjithashtu.
        var list = await admin.GetFromJsonAsync<Booking.Application.Common.Models.PagedResult<AdminAppointmentListItemDto>>(
            $"/api/admin/appointments?ClinicId={DbSeeder.Ids.ClinicDardania}&PageSize=100&From={start:yyyy-MM-dd}&To={start:yyyy-MM-dd}",
            TestHelpers.Json);
        list!.Items.Should().Contain(a => a.Id == appointment.Id && a.BookedByClinic);

        // Kush e rezervoi ruhet në audit.
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        (await db.AuditLogs.AnyAsync(l => l.Action == "APPOINTMENT_CREATED_BY_ADMIN" && l.EntityId == appointment.Id.ToString()))
            .Should().BeTrue();
    }

    [Fact]
    public async Task AdminOfAnotherClinic_GetsForbidden()
    {
        var dardania = await DardaniaAdminAsync();
        var patient = await CreatePatientAsync(dardania, email: null);
        var foreignAdmin = await SunnyAdminAsync();

        var response = await BookAsync(foreignAdmin, patient.PatientProfileId, Slot(new TimeOnly(9, 30)));

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Patient_GetsForbidden_OnStaffBookingAndLookup()
    {
        var patientClient = await _factory.CreateSignedInClientAsync();

        (await BookAsync(patientClient, Guid.NewGuid(), Slot(new TimeOnly(10, 0)))).StatusCode
            .Should().Be(HttpStatusCode.Forbidden);
        (await patientClient.GetAsync("/api/admin/patients/search?query=%2B383%2044%20111%20222")).StatusCode
            .Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task DoubleBooking_IsRefused()
    {
        var admin = await DardaniaAdminAsync();
        var first = await CreatePatientAsync(admin, email: null);
        var second = await CreatePatientAsync(admin, email: null);
        var start = Slot(new TimeOnly(10, 30));

        (await BookAsync(admin, first.PatientProfileId, start)).StatusCode.Should().Be(HttpStatusCode.Created);
        (await BookAsync(admin, second.PatientProfileId, start)).StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task PatientWithoutEmail_GetsNoEmail_AndNoError()
    {
        var admin = await DardaniaAdminAsync();
        var patient = await CreatePatientAsync(admin, email: null);

        var response = await BookAsync(admin, patient.PatientProfileId, Slot(new TimeOnly(11, 0)));

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        // Pacienti s'ka adresë: asnjë dërgim s'tentohet drejt një adrese bosh, dhe rezervimi s'dështoi.
        var inbox = await admin.GetFromJsonAsync<List<DevEmail>>("/api/dev/emails", TestHelpers.Json);
        inbox!.Should().NotContain(m => string.IsNullOrWhiteSpace(m.ToEmail));
    }

    [Fact]
    public async Task PatientWithEmail_GetsTheNormalConfirmation_ButNoWelcomeEmail()
    {
        var admin = await DardaniaAdminAsync();
        var email = $"telefon-{Guid.NewGuid():N}@test.dev";
        var patient = await CreatePatientAsync(admin, email);

        var beforeBooking = await admin.GetFromJsonAsync<List<DevEmail>>(
            $"/api/dev/emails?toEmail={Uri.EscapeDataString(email)}", TestHelpers.Json);
        beforeBooking.Should().BeEmpty("krijimi i pacientit nga recepsioni s'dërgon email mirëseardhjeje");

        (await BookAsync(admin, patient.PatientProfileId, Slot(new TimeOnly(11, 30)))).StatusCode
            .Should().Be(HttpStatusCode.Created);

        var afterBooking = await admin.GetFromJsonAsync<List<DevEmail>>(
            $"/api/dev/emails?toEmail={Uri.EscapeDataString(email)}", TestHelpers.Json);
        afterBooking.Should().ContainSingle();
    }

    [Fact]
    public async Task PatientSelfBooking_IsNotMarkedBookedByClinic()
    {
        var patientClient = await _factory.CreateSignedInClientAsync();

        var response = await patientClient.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = DbSeeder.Ids.DoctorBlerta,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = Slot(new TimeOnly(13, 0))
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var appointment = await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);
        appointment!.BookedByClinic.Should().BeFalse();
        appointment.Price.Should().BeGreaterThan(0);
    }

    // ---------- ndihmës ----------

    /// <summary>E mërkura e javës së ardhshme — larg testeve të tjera që përdorin hënën/martën.</summary>
    private static DateTime Slot(TimeOnly time) => TestHelpers.NextMonday().AddDays(9).ToDateTime(time);

    private async Task<HttpClient> DardaniaAdminAsync()
    {
        var client = _factory.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);
    }

    private async Task<HttpClient> SunnyAdminAsync()
    {
        var anon = _factory.CreateClient();
        var email = $"admin-sunny-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(anon, email);

        var superAdmin = _factory.CreateClient();
        superAdmin.WithToken((await TestHelpers.LoginAsync(superAdmin, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword)).AccessToken);
        (await superAdmin.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicSunny}/admins",
            new AssignClinicAdminRequest { Email = email }, TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var client = _factory.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(client, email, BookingApiFactory.DefaultUserPassword)).AccessToken);
    }

    private static async Task<AdminPatientDto> CreatePatientAsync(HttpClient admin, string? email)
    {
        var response = await admin.PostAsJsonAsync("/api/admin/patients", new AdminCreatePatientRequest
        {
            FirstName = "Thirrës",
            LastName = "Telefoni",
            PhoneNumber = $"+383 49 {Random.Shared.Next(100, 999)} {Random.Shared.Next(100, 999)}",
            Email = email
        }, TestHelpers.Json);
        response.StatusCode.Should().BeOneOf(HttpStatusCode.Created, HttpStatusCode.OK);
        return (await response.Content.ReadFromJsonAsync<AdminPatientDto>(TestHelpers.Json))!;
    }

    private static Task<HttpResponseMessage> BookAsync(HttpClient client, Guid patientProfileId, DateTime start) =>
        client.PostAsJsonAsync("/api/admin/appointments", new AdminCreateAppointmentRequest
        {
            PatientProfileId = patientProfileId,
            DoctorId = DbSeeder.Ids.DoctorBlerta,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = start
        }, TestHelpers.Json);
}
