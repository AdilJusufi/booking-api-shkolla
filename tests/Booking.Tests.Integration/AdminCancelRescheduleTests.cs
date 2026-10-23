using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Schedules;
using Booking.Domain.Enums;
using Booking.Infrastructure.Notifications;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Anulimi dhe riplanifikimi nga stafi i klinikës: pa kufirin 12-orësh të pacientit,
/// vetëm klinika pronare, asnjëherë për një termin që ka filluar; dhe termini i vjetër
/// i riplanifikuar tregon te i riu (WR-19). Ora kontrollohet me ManualClock, doktori është i ri.
/// </summary>
[Collection("api")]
public class AdminCancelRescheduleTests
{
    private static readonly TimeZoneInfo Prishtina = TimeZoneInfo.FindSystemTimeZoneById("Europe/Belgrade");
    private readonly BookingApiFactory _factory;

    public AdminCancelRescheduleTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task OwnClinicAdmin_CanCancel_TwoHoursBefore_AndThePatientGetsTheCancellationEmail()
    {
        var clock = new ManualClock { UtcNow = DateTime.UtcNow };
        await using var app = WithClock(clock);
        var doctorId = await CreateDoctorAsync(app);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(3);
        var email = $"anulim-klinika-{Guid.NewGuid():N}@test.dev";
        var patient = app.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient, email)).AccessToken);
        var appointment = await BookAsync(patient, doctorId, date.ToDateTime(new TimeOnly(10, 0)));

        // Hyrja para lëvizjes së orës: token-i lëshohet me orën reale.
        var admin = await DardaniaAdminAsync(app);

        // 2 orë para — pacienti s'mund të anulojë më, klinika po.
        clock.UtcNow = ToUtc(date, new TimeOnly(8, 0));
        var response = await admin.PostAsJsonAsync($"/api/admin/appointments/{appointment.Id}/cancel",
            new AdminCancelAppointmentRequest { Reason = "Mjeku u sëmur" }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var cancelled = (await response.Content.ReadFromJsonAsync<DoctorAppointmentDto>(TestHelpers.Json))!;
        cancelled.Status.Should().Be(AppointmentStatus.CancelledByClinic);
        cancelled.CancellationReason.Should().Be("Mjeku u sëmur");

        var inbox = await admin.GetFromJsonAsync<List<DevEmail>>(
            $"/api/dev/emails?toEmail={Uri.EscapeDataString(email)}", TestHelpers.Json);
        inbox.Should().Contain(m => m.Subject == "Termini u anulua");
    }

    [Fact]
    public async Task OwnClinicAdmin_CanReschedule_TwoHoursBefore_AndTheOldAppointmentLinksToTheNewOne()
    {
        var clock = new ManualClock { UtcNow = DateTime.UtcNow };
        await using var app = WithClock(clock);
        var doctorId = await CreateDoctorAsync(app);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(3);
        var patient = app.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);
        var appointment = await BookAsync(patient, doctorId, date.ToDateTime(new TimeOnly(10, 0)));

        var admin = await DardaniaAdminAsync(app);
        clock.UtcNow = ToUtc(date, new TimeOnly(8, 0));
        var newStart = date.AddDays(1).ToDateTime(new TimeOnly(11, 30));
        var response = await admin.PostAsJsonAsync($"/api/admin/appointments/{appointment.Id}/reschedule",
            new AdminRescheduleAppointmentRequest { NewStartDateTime = newStart }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var replacement = (await response.Content.ReadFromJsonAsync<DoctorAppointmentDto>(TestHelpers.Json))!;
        replacement.StartDateTime.Should().Be(newStart);
        replacement.MedicalServiceId.Should().Be(DbSeeder.Ids.ServiceDentalCleaning);

        var old = await patient.GetFromJsonAsync<AppointmentDto>($"/api/appointments/my/{appointment.Id}", TestHelpers.Json);
        old!.Status.Should().Be(AppointmentStatus.Rescheduled);
        old.RescheduledToAppointmentId.Should().Be(replacement.Id);
    }

    [Fact]
    public async Task PatientReschedule_AlsoLinksTheOldAppointmentToTheNewOne()
    {
        var clock = new ManualClock { UtcNow = DateTime.UtcNow };
        await using var app = WithClock(clock);
        var doctorId = await CreateDoctorAsync(app);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(3);
        var patient = app.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);
        var appointment = await BookAsync(patient, doctorId, date.ToDateTime(new TimeOnly(10, 0)));

        var response = await patient.PostAsJsonAsync($"/api/appointments/{appointment.Id}/reschedule",
            new RescheduleAppointmentRequest { NewStartDateTime = date.ToDateTime(new TimeOnly(14, 0)) }, TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var replacement = (await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json))!;

        var old = await patient.GetFromJsonAsync<AppointmentDto>($"/api/appointments/my/{appointment.Id}", TestHelpers.Json);
        old!.RescheduledToAppointmentId.Should().Be(replacement.Id);
        replacement.RescheduledToAppointmentId.Should().BeNull();
    }

    [Fact]
    public async Task AdminOfAnotherClinic_CannotCancelOrReschedule()
    {
        var clock = new ManualClock { UtcNow = DateTime.UtcNow };
        await using var app = WithClock(clock);
        var doctorId = await CreateDoctorAsync(app);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(3);
        var patient = app.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);
        var appointment = await BookAsync(patient, doctorId, date.ToDateTime(new TimeOnly(10, 0)));

        var foreignAdmin = await SunnyAdminAsync(app);
        (await foreignAdmin.PostAsJsonAsync($"/api/admin/appointments/{appointment.Id}/cancel",
            new AdminCancelAppointmentRequest(), TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await foreignAdmin.PostAsJsonAsync($"/api/admin/appointments/{appointment.Id}/reschedule",
            new AdminRescheduleAppointmentRequest { NewStartDateTime = date.ToDateTime(new TimeOnly(15, 0)) }, TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var unchanged = await patient.GetFromJsonAsync<AppointmentDto>($"/api/appointments/my/{appointment.Id}", TestHelpers.Json);
        unchanged!.Status.Should().Be(AppointmentStatus.Confirmed);
    }

    [Fact]
    public async Task AnAppointmentThatHasStarted_CannotBeCancelledOrRescheduledByTheClinic()
    {
        var clock = new ManualClock { UtcNow = DateTime.UtcNow };
        await using var app = WithClock(clock);
        var doctorId = await CreateDoctorAsync(app);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(3);
        var patient = app.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);
        var appointment = await BookAsync(patient, doctorId, date.ToDateTime(new TimeOnly(10, 0)));

        var admin = await DardaniaAdminAsync(app);

        // 10 minuta pas fillimit.
        clock.UtcNow = ToUtc(date, new TimeOnly(10, 10));

        var cancel = await admin.PostAsJsonAsync($"/api/admin/appointments/{appointment.Id}/cancel",
            new AdminCancelAppointmentRequest(), TestHelpers.Json);
        cancel.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await cancel.Content.ReadAsStringAsync()).Should().Contain("appointment-already-started");

        var reschedule = await admin.PostAsJsonAsync($"/api/admin/appointments/{appointment.Id}/reschedule",
            new AdminRescheduleAppointmentRequest { NewStartDateTime = date.AddDays(1).ToDateTime(new TimeOnly(10, 0)) }, TestHelpers.Json);
        reschedule.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await reschedule.Content.ReadAsStringAsync()).Should().Contain("appointment-already-started");
    }

    // ---------- ndihmës ----------

    private static DateTime ToUtc(DateOnly date, TimeOnly time) =>
        TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(time), Prishtina);

    private WebApplicationFactory<Program> WithClock(ManualClock clock) =>
        _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IDateTimeProvider>();
            services.AddSingleton<IDateTimeProvider>(clock);
        }));

    private static async Task<HttpClient> DardaniaAdminAsync(WebApplicationFactory<Program> app)
    {
        var client = app.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(client, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);
    }

    private static async Task<HttpClient> SunnyAdminAsync(WebApplicationFactory<Program> app)
    {
        var anon = app.CreateClient();
        var email = $"admin-sunny-{Guid.NewGuid():N}@test.dev";
        await TestHelpers.RegisterPatientAsync(anon, email);

        var superAdmin = app.CreateClient();
        superAdmin.WithToken((await TestHelpers.LoginAsync(superAdmin, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword)).AccessToken);
        (await superAdmin.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicSunny}/admins",
            new AssignClinicAdminRequest { Email = email }, TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        var client = app.CreateClient();
        return client.WithToken((await TestHelpers.LoginAsync(client, email, BookingApiFactory.DefaultUserPassword)).AccessToken);
    }

    private static async Task<Guid> CreateDoctorAsync(WebApplicationFactory<Program> app)
    {
        var admin = await DardaniaAdminAsync(app);
        var created = await admin.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors", new CreateDoctorRequest
        {
            FirstName = "Stafi",
            LastName = "Anulon",
            Email = $"doktor-staf-{Guid.NewGuid():N}@test.dev",
            PhoneNumber = "+383 44 777 000",
            InitialPassword = BookingApiFactory.DefaultUserPassword,
            LicenseNumber = $"LIC-{Guid.NewGuid():N}"[..12],
            YearsOfExperience = 1,
            SpecialtyIds = [DbSeeder.Ids.SpecialtyDentist],
            BranchIds = [DbSeeder.Ids.BranchDardania],
            ServiceIds = [DbSeeder.Ids.ServiceDentalCleaning]
        }, TestHelpers.Json);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var doctor = (await created.Content.ReadFromJsonAsync<AdminDoctorDetailDto>(TestHelpers.Json))!;
        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            (await admin.PostAsJsonAsync($"/api/admin/doctors/{doctor.Id}/working-schedules", new CreateWorkingScheduleRequest
            {
                ClinicBranchId = DbSeeder.Ids.BranchDardania,
                DayOfWeek = day,
                StartTime = new TimeOnly(8, 0),
                EndTime = new TimeOnly(18, 0),
                SlotDurationMinutes = 30
            }, TestHelpers.Json)).StatusCode.Should().Be(HttpStatusCode.Created);
        }

        return doctor.Id;
    }

    private static async Task<AppointmentDto> BookAsync(HttpClient patient, Guid doctorId, DateTime localStart)
    {
        var response = await patient.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = doctorId,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = localStart
        }, TestHelpers.Json);
        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json))!;
    }
}
