using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Schedules;
using Booking.Domain.Enums;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Rrugët që kërkojnë "kalim kohe" dhe që kontrolli në dev s'i mbuloi: No-show nga fillimi
/// në fund, dhe anulimi brenda 12 orëve (refuzohet me mesazh të qartë). Ora e serverit
/// kontrollohet me ManualClock; termini është gjithmonë i një doktori të ri.
/// </summary>
[Collection("api")]
public class AppointmentLifecycleClockTests
{
    private static readonly TimeZoneInfo Prishtina = TimeZoneInfo.FindSystemTimeZoneById("Europe/Belgrade");
    private readonly BookingApiFactory _factory;

    public AppointmentLifecycleClockTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task NoShow_EndToEnd_OnlyAfterStart_ThenVisibleToPatient()
    {
        var clock = new ManualClock { UtcNow = DateTime.UtcNow };
        await using var app = WithClock(clock);
        var (doctorEmail, doctorId) = await CreateDoctorAsync(app);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(3);
        var patient = app.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);
        var appointment = await BookAsync(patient, doctorId, date.ToDateTime(new TimeOnly(10, 0)));

        var doctor = app.CreateClient();
        doctor.WithToken((await TestHelpers.LoginAsync(doctor, doctorEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);

        // Para fillimit: refuzohet.
        var early = await doctor.PostAsync($"/api/doctor/appointments/{appointment.Id}/no-show", null);
        early.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        (await early.Content.ReadAsStringAsync()).Should().Contain("no-show-before-start");

        // 30 minuta pas fillimit: lejohet.
        clock.UtcNow = ToUtc(date, new TimeOnly(10, 30));
        var marked = await doctor.PostAsync($"/api/doctor/appointments/{appointment.Id}/no-show", null);
        marked.StatusCode.Should().Be(HttpStatusCode.OK);
        (await marked.Content.ReadFromJsonAsync<DoctorAppointmentDto>(TestHelpers.Json))!.Status.Should().Be(AppointmentStatus.NoShow);

        var seenByPatient = await patient.GetFromJsonAsync<AppointmentDto>($"/api/appointments/my/{appointment.Id}", TestHelpers.Json);
        seenByPatient!.Status.Should().Be(AppointmentStatus.NoShow);

        // S'mund të ndryshohet më tej (p.sh. në Completed).
        (await doctor.PostAsync($"/api/doctor/appointments/{appointment.Id}/complete", null))
            .StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
    }

    [Fact]
    public async Task CancellingInsideThe12HourWindow_IsRefused_WithAClearCode()
    {
        var clock = new ManualClock { UtcNow = DateTime.UtcNow };
        await using var app = WithClock(clock);
        var (_, doctorId) = await CreateDoctorAsync(app);
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(3);
        var patient = app.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);
        var appointment = await BookAsync(patient, doctorId, date.ToDateTime(new TimeOnly(11, 0)));

        // 6 orë para terminit.
        clock.UtcNow = ToUtc(date, new TimeOnly(5, 0));
        var refused = await patient.PostAsJsonAsync($"/api/appointments/{appointment.Id}/cancel", new CancelAppointmentRequest(), TestHelpers.Json);

        refused.StatusCode.Should().Be(HttpStatusCode.UnprocessableEntity);
        var body = await refused.Content.ReadAsStringAsync();
        body.Should().Contain("cancellation-window-passed").And.Contain("12 orë");

        // 13 orë para terminit: lejohet.
        clock.UtcNow = ToUtc(date, new TimeOnly(11, 0)).AddHours(-13);
        (await patient.PostAsJsonAsync($"/api/appointments/{appointment.Id}/cancel", new CancelAppointmentRequest(), TestHelpers.Json))
            .StatusCode.Should().Be(HttpStatusCode.OK);
    }

    private static DateTime ToUtc(DateOnly date, TimeOnly time) =>
        TimeZoneInfo.ConvertTimeToUtc(date.ToDateTime(time), Prishtina);

    private WebApplicationFactory<Program> WithClock(ManualClock clock) =>
        _factory.WithWebHostBuilder(builder => builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<IDateTimeProvider>();
            services.AddSingleton<IDateTimeProvider>(clock);
        }));

    private static async Task<(string Email, Guid Id)> CreateDoctorAsync(WebApplicationFactory<Program> app)
    {
        var admin = app.CreateClient();
        admin.WithToken((await TestHelpers.LoginAsync(admin, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);
        var email = $"doktor-ora-{Guid.NewGuid():N}@test.dev";
        var created = await admin.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors", new CreateDoctorRequest
        {
            FirstName = "Ora",
            LastName = "Manuale",
            Email = email,
            PhoneNumber = "+383 44 666 000",
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

        return (email, doctor.Id);
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
