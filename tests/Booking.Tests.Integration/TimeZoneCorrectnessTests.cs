using System.Net;
using System.Net.Http.Json;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Availability;
using Booking.Application.Features.Schedules;
using Booking.Infrastructure.Persistence;
using FluentAssertions;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// WR-03: një mungesë 09:00–17:00 ruhej si 08:00–16:00 dhe pacientët mund të rezervonin
/// 16:00 dhe 16:30. Rregulli: API-ja flet orën e klinikës (Europe/Belgrade) pa
/// zhvendosje; çdo kohë me zhvendosje të qartë ("Z") trajtohet si moment i saktë.
/// Çdo test krijon doktorin e vet që mungesat të mos prekin testet e tjera të koleksionit.
/// </summary>
[Collection("api")]
public class TimeZoneCorrectnessTests
{
    private static readonly TimeZoneInfo Prishtina = TimeZoneInfo.FindSystemTimeZoneById("Europe/Belgrade");
    private readonly BookingApiFactory _factory;

    public TimeZoneCorrectnessTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Absence_0900To1700_BlocksExactlyThatWindow_AndBooking1630IsRefused()
    {
        var (doctorId, doctorClient) = await CreateDoctorWithFullDaySchedulesAsync();
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(3);

        await AddAbsenceAsync(doctorClient, $"{date:yyyy-MM-dd}T09:00:00", $"{date:yyyy-MM-dd}T17:00:00");

        var slots = await GetSlotStartsAsync(doctorId, date);
        slots.Should().Contain(["08:00", "08:30", "17:00", "17:30"]);
        slots.Should().NotContain(s => string.CompareOrdinal(s, "09:00") >= 0 && string.CompareOrdinal(s, "17:00") < 0,
            "asnjë slot brenda mungesës 09:00–17:00 s'duhet të ofrohet");

        var patientClient = await _factory.CreateSignedInClientAsync();
        var refused = await BookAsync(patientClient, doctorId, date.ToDateTime(new TimeOnly(16, 30)));
        refused.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var allowed = await BookAsync(patientClient, doctorId, date.ToDateTime(new TimeOnly(8, 30)));
        allowed.StatusCode.Should().Be(HttpStatusCode.Created);
        var appointment = await allowed.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json);
        appointment!.StartDateTime.Should().Be(date.ToDateTime(new TimeOnly(8, 30)));
    }

    [Fact]
    public async Task Absence_ReadsBackExactlyAsTyped_InBothSeasons()
    {
        var (doctorId, doctorClient) = await CreateDoctorWithFullDaySchedulesAsync();
        var first = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(4);
        var dates = new List<DateOnly> { first };

        // Data e parë në anën tjetër të ndërrimit të orës, kur bie brenda dritares së sloteve.
        var firstOffset = Prishtina.GetUtcOffset(first.ToDateTime(new TimeOnly(12, 0)));
        for (var d = first.AddDays(1); d <= first.AddDays(170); d = d.AddDays(1))
        {
            if (Prishtina.GetUtcOffset(d.ToDateTime(new TimeOnly(12, 0))) != firstOffset)
            {
                dates.Add(d.AddDays(1));
                break;
            }
        }

        foreach (var date in dates)
        {
            await AddAbsenceAsync(doctorClient, $"{date:yyyy-MM-dd}T09:00:00", $"{date:yyyy-MM-dd}T17:00:00");

            var list = await doctorClient.GetFromJsonAsync<List<UnavailabilityDto>>(
                $"/api/doctor/unavailability?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", TestHelpers.Json);
            list.Should().NotBeNull().And.ContainSingle();
            list![0].StartDateTime.Should().Be(date.ToDateTime(new TimeOnly(9, 0)));
            list[0].EndDateTime.Should().Be(date.ToDateTime(new TimeOnly(17, 0)));

            var slots = await GetSlotStartsAsync(doctorId, date);
            slots.Should().Contain("08:30").And.Contain("17:00").And.NotContain("16:30").And.NotContain("09:00");
        }
    }

    [Fact]
    public async Task Absence_SentAsUtcInstant_IsStoredAsThatInstant_NotShifted()
    {
        var (doctorId, doctorClient) = await CreateDoctorWithFullDaySchedulesAsync();
        var date = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(5);
        var localStart = date.ToDateTime(new TimeOnly(9, 0));
        var localEnd = date.ToDateTime(new TimeOnly(17, 0));
        var utcStart = TimeZoneInfo.ConvertTimeToUtc(localStart, Prishtina);
        var utcEnd = TimeZoneInfo.ConvertTimeToUtc(localEnd, Prishtina);

        // E njëjta formë që dërgonte faqja e vjetër: toISOString() → "...Z".
        await AddAbsenceAsync(doctorClient, $"{utcStart:yyyy-MM-ddTHH:mm:ss}Z", $"{utcEnd:yyyy-MM-ddTHH:mm:ss}Z");

        var list = await doctorClient.GetFromJsonAsync<List<UnavailabilityDto>>(
            $"/api/doctor/unavailability?from={date:yyyy-MM-dd}&to={date:yyyy-MM-dd}", TestHelpers.Json);
        list!.Single().StartDateTime.Should().Be(localStart);
        list!.Single().EndDateTime.Should().Be(localEnd);

        (await GetSlotStartsAsync(doctorId, date)).Should().NotContain("16:30");
    }

    // ---------- ndihmës ----------

    private async Task<(Guid DoctorId, HttpClient DoctorClient)> CreateDoctorWithFullDaySchedulesAsync()
    {
        var adminClient = _factory.CreateClient();
        adminClient.WithToken((await TestHelpers.LoginAsync(adminClient, DbSeeder.ClinicAdminEmail, BookingApiFactory.DefaultUserPassword)).AccessToken);

        var email = $"doktor-tz-{Guid.NewGuid():N}@test.dev";
        var created = await adminClient.PostAsJsonAsync($"/api/admin/clinics/{DbSeeder.Ids.ClinicDardania}/doctors", new CreateDoctorRequest
        {
            FirstName = "Ora",
            LastName = "Klinikes",
            Email = email,
            PhoneNumber = "+383 44 333 000",
            InitialPassword = BookingApiFactory.DefaultUserPassword,
            LicenseNumber = $"LIC-{Guid.NewGuid():N}"[..12],
            YearsOfExperience = 1,
            SpecialtyIds = [DbSeeder.Ids.SpecialtyDentist],
            BranchIds = [DbSeeder.Ids.BranchDardania],
            ServiceIds = [DbSeeder.Ids.ServiceDentalCleaning]
        }, TestHelpers.Json);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var doctor = await created.Content.ReadFromJsonAsync<AdminDoctorDetailDto>(TestHelpers.Json);

        foreach (var day in Enum.GetValues<DayOfWeek>())
        {
            var schedule = await adminClient.PostAsJsonAsync($"/api/admin/doctors/{doctor!.Id}/working-schedules", new CreateWorkingScheduleRequest
            {
                ClinicBranchId = DbSeeder.Ids.BranchDardania,
                DayOfWeek = day,
                StartTime = new TimeOnly(8, 0),
                EndTime = new TimeOnly(18, 0),
                SlotDurationMinutes = 30
            }, TestHelpers.Json);
            schedule.StatusCode.Should().Be(HttpStatusCode.Created);
        }

        var doctorClient = _factory.CreateClient();
        doctorClient.WithToken((await TestHelpers.LoginAsync(doctorClient, email, BookingApiFactory.DefaultUserPassword)).AccessToken);
        return (doctor!.Id, doctorClient);
    }

    private static async Task AddAbsenceAsync(HttpClient doctorClient, string start, string end)
    {
        // String-et e papërpunuara — që testi të kontrollojë saktësisht formën në tel.
        var response = await doctorClient.PostAsync("/api/doctor/unavailability", JsonContent.Create(new
        {
            clinicBranchId = (Guid?)null,
            startDateTime = start,
            endDateTime = end,
            reason = "Test i orës"
        }));
        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    private async Task<List<string>> GetSlotStartsAsync(Guid doctorId, DateOnly date)
    {
        var client = await _factory.CreateSignedInClientAsync();
        var slots = await client.GetFromJsonAsync<List<AvailableSlotDto>>(
            $"/api/doctors/{doctorId}/available-slots?BranchId={DbSeeder.Ids.BranchDardania}&ServiceId={DbSeeder.Ids.ServiceDentalCleaning}&Date={date:yyyy-MM-dd}",
            TestHelpers.Json);
        return slots!.Where(s => s.IsAvailable).Select(s => s.StartDateTime.ToString("HH:mm")).ToList();
    }

    private static Task<HttpResponseMessage> BookAsync(HttpClient patientClient, Guid doctorId, DateTime localStart) =>
        patientClient.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = doctorId,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = localStart
        }, TestHelpers.Json);
}
