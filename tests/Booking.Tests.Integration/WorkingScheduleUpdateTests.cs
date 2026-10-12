using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Schedules;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// PUT i orarit (doktori + admini): të njëjtat kontrolle si krijimi, plus refuzimi kur ndryshimi
/// do të linte termine të rezervuara jashtë orarit. Dr. Fatos (Sunny) punon E hënë–E premte sipas
/// seed-it; testet krijojnë vetë orare të shtunës, që s'prekin asnjë test tjetër.
/// </summary>
[Collection("api")]
public class WorkingScheduleUpdateTests
{
    private readonly BookingApiFactory _factory;

    public WorkingScheduleUpdateTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Doctor_UpdateOwnSchedule_ChangesHours()
    {
        var doctor = await FatosClientAsync();
        var created = await CreateSaturdayAsync(doctor, new TimeOnly(7, 0), new TimeOnly(8, 0));

        var response = await doctor.PutAsJsonAsync(
            $"/api/doctor/working-schedules/{created.Id}", Request(new TimeOnly(6, 30), new TimeOnly(8, 0), slot: 15), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var updated = await response.Content.ReadFromJsonAsync<WorkingScheduleDto>(TestHelpers.Json);
        updated!.Id.Should().Be(created.Id);
        updated.StartTime.Should().Be(new TimeOnly(6, 30));
        updated.SlotDurationMinutes.Should().Be(15);
    }

    [Fact]
    public async Task Doctor_UpdateIntoAnotherSchedule_Returns409Overlap()
    {
        var doctor = await FatosClientAsync();
        await CreateSaturdayAsync(doctor, new TimeOnly(18, 0), new TimeOnly(19, 0));
        var second = await CreateSaturdayAsync(doctor, new TimeOnly(19, 0), new TimeOnly(20, 0));

        var response = await doctor.PutAsJsonAsync(
            $"/api/doctor/working-schedules/{second.Id}", Request(new TimeOnly(18, 30), new TimeOnly(20, 0)), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await CodeOf(response)).Should().Be("schedule-overlap");
    }

    [Fact]
    public async Task Doctor_UpdateThatStrandsBookedAppointment_Returns409WithAffectedList()
    {
        var doctor = await FatosClientAsync();
        var schedule = await CreateSaturdayAsync(doctor, new TimeOnly(9, 0), new TimeOnly(12, 0));
        var appointmentId = await BookSaturdayAsync(new TimeOnly(11, 0));

        // 09–10:30 s'e mbulon më terminin 11:00 → refuzim me listën e termineve.
        var response = await doctor.PutAsJsonAsync(
            $"/api/doctor/working-schedules/{schedule.Id}", Request(new TimeOnly(9, 0), new TimeOnly(10, 30)), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        body.RootElement.GetProperty("code").GetString().Should().Be("schedule-has-booked-appointments");
        body.RootElement.GetProperty("affectedAppointments").EnumerateArray()
            .Select(a => a.GetProperty("id").GetGuid())
            .Should().Contain(appointmentId);

        // Një ndryshim që e mban terminin brenda orarit lejohet.
        var ok = await doctor.PutAsJsonAsync(
            $"/api/doctor/working-schedules/{schedule.Id}", Request(new TimeOnly(10, 0), new TimeOnly(12, 0)), TestHelpers.Json);
        ok.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Doctor_UpdateSomeoneElsesSchedule_Returns404()
    {
        var fatos = await FatosClientAsync();
        var schedule = await CreateSaturdayAsync(fatos, new TimeOnly(20, 0), new TimeOnly(21, 0));

        var elira = _factory.CreateClient();
        elira.WithToken((await TestHelpers.LoginAsync(
            elira, DbSeeder.DoctorEmails[3], BookingApiFactory.DefaultUserPassword)).AccessToken);

        var response = await elira.PutAsJsonAsync(
            $"/api/doctor/working-schedules/{schedule.Id}", Request(new TimeOnly(20, 0), new TimeOnly(21, 0)), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task ClinicAdmin_UpdateDoctorOfAnotherClinic_Returns403()
    {
        var fatos = await FatosClientAsync();
        var schedule = await CreateSaturdayAsync(fatos, new TimeOnly(21, 0), new TimeOnly(22, 0));

        var dardaniaAdmin = _factory.CreateClient();
        dardaniaAdmin.WithToken((await TestHelpers.LoginAsync(
            dardaniaAdmin, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);

        var response = await dardaniaAdmin.PutAsJsonAsync(
            $"/api/admin/doctors/{DbSeeder.Ids.DoctorFatos}/working-schedules/{schedule.Id}",
            Request(new TimeOnly(21, 0), new TimeOnly(22, 0)), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task SuperAdmin_UpdateDoctorSchedule_Succeeds()
    {
        var fatos = await FatosClientAsync();
        var schedule = await CreateSaturdayAsync(fatos, new TimeOnly(5, 0), new TimeOnly(6, 0));

        var superAdmin = _factory.CreateClient();
        superAdmin.WithToken((await TestHelpers.LoginAsync(
            superAdmin, DbSeeder.SuperAdminEmail, BookingApiFactory.SuperAdminPassword)).AccessToken);

        var response = await superAdmin.PutAsJsonAsync(
            $"/api/admin/doctors/{DbSeeder.Ids.DoctorFatos}/working-schedules/{schedule.Id}",
            Request(new TimeOnly(5, 0), new TimeOnly(6, 30)), TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadFromJsonAsync<WorkingScheduleDto>(TestHelpers.Json))!
            .EndTime.Should().Be(new TimeOnly(6, 30));
    }

    // ---------- Ndihmës ----------

    private static UpdateWorkingScheduleRequest Request(TimeOnly start, TimeOnly end, int slot = 30) => new()
    {
        ClinicBranchId = DbSeeder.Ids.BranchSunny,
        DayOfWeek = DayOfWeek.Saturday,
        StartTime = start,
        EndTime = end,
        SlotDurationMinutes = slot
    };

    private async Task<HttpClient> FatosClientAsync()
    {
        var client = _factory.CreateClient();
        client.WithToken((await TestHelpers.LoginAsync(
            client, DbSeeder.DoctorEmails[4], BookingApiFactory.DefaultUserPassword)).AccessToken);
        return client;
    }

    private static async Task<WorkingScheduleDto> CreateSaturdayAsync(HttpClient doctor, TimeOnly start, TimeOnly end)
    {
        var response = await doctor.PostAsJsonAsync("/api/doctor/working-schedules", new CreateWorkingScheduleRequest
        {
            ClinicBranchId = DbSeeder.Ids.BranchSunny,
            DayOfWeek = DayOfWeek.Saturday,
            StartTime = start,
            EndTime = end,
            SlotDurationMinutes = 30
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<WorkingScheduleDto>(TestHelpers.Json))!;
    }

    private async Task<Guid> BookSaturdayAsync(TimeOnly time)
    {
        var patient = _factory.CreateClient();
        patient.WithToken((await TestHelpers.RegisterPatientAsync(patient)).AccessToken);

        var response = await patient.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = DbSeeder.Ids.DoctorFatos,
            ClinicBranchId = DbSeeder.Ids.BranchSunny,
            MedicalServiceId = DbSeeder.Ids.ServicePediatricCheckup,
            StartDateTime = TestHelpers.NextMonday().AddDays(5).ToDateTime(time)
        }, TestHelpers.Json);

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        return (await response.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json))!.Id;
    }

    private static async Task<string?> CodeOf(HttpResponseMessage response)
    {
        using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return body.RootElement.GetProperty("code").GetString();
    }
}
