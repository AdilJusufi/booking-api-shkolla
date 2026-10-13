using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Features.Appointments;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Infrastructure.Common;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Notifications;
using Booking.Infrastructure.Persistence;
using Booking.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Kujtesat e termineve kundër PostgreSQL-it real — garancia kundër dyfishimit mbështetet te
/// semantika e row lock-ut të Postgres-it, që s'ekziston në InMemory/SQLite.
///
/// Izolimi: çdo test përdor një "tani" RASTËSOR në vitet 2000–2024 (si ManualClock), pra dritaret
/// e tij s'përputhen me terminet e testeve të tjera (që jetojnë në kohën reale). Rreshti i
/// "BackgroundJobStates" është global, prandaj çdo test e vendos vetë para ekzekutimit.
/// </summary>
[Collection("api")]
public class AppointmentReminderTests
{
    private readonly BookingApiFactory _factory;

    public AppointmentReminderTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public async Task Window_21h_no_23h_yes_27h_no()
    {
        var now = RandomNow();
        var patient = await CreatePatientAsync(email: true);
        var at21 = await CreateAppointmentAsync(patient, now.AddHours(21), bookedAt: now.AddDays(-5));
        var at23 = await CreateAppointmentAsync(patient, now.AddHours(23), bookedAt: now.AddDays(-5));
        var at27 = await CreateAppointmentAsync(patient, now.AddHours(27), bookedAt: now.AddDays(-5));
        await SetLastCompletedAsync(now.AddMinutes(-15)); // punë normale, pa gjumë

        var email = new RecordingEmailService();
        var result = await RunAsync(now, email);

        result.Outcome.Should().Be(ReminderRunOutcome.Completed);
        email.SentTo(patient.Email!).Should().ContainSingle();
        (await ReminderSentAtAsync(at23)).Should().NotBeNull();
        (await ReminderSentAtAsync(at21)).Should().BeNull();
        (await ReminderSentAtAsync(at27)).Should().BeNull();
    }

    [Fact]
    public async Task Cancelled_already_sent_no_email_and_booked_late_get_no_reminder()
    {
        var now = RandomNow();
        var withEmail = await CreatePatientAsync(email: true);
        var phoneOnly = await CreatePatientAsync(email: false);

        var eligible = await CreateAppointmentAsync(withEmail, now.AddHours(22.5), bookedAt: now.AddDays(-3));
        var cancelled = await CreateAppointmentAsync(withEmail, now.AddHours(23), bookedAt: now.AddDays(-3),
            status: AppointmentStatus.CancelledByPatient);
        var alreadySent = await CreateAppointmentAsync(withEmail, now.AddHours(23.5), bookedAt: now.AddDays(-3),
            reminderSentAt: now.AddHours(-1));
        var noEmail = await CreateAppointmentAsync(phoneOnly, now.AddHours(24), bookedAt: now.AddDays(-3));
        // Rezervuar 1 orë më parë për pas 22.2 orësh: 23.2h përpara (< 24h).
        var bookedLate = await CreateAppointmentAsync(withEmail, now.AddHours(22.2), bookedAt: now.AddHours(-1));
        await SetLastCompletedAsync(now.AddMinutes(-15));

        var email = new RecordingEmailService();
        var result = await RunAsync(now, email);

        // Pacienti pa email s'është gabim: ekzekutimi përfundon normalisht.
        result.Outcome.Should().Be(ReminderRunOutcome.Completed);
        result.Failed.Should().Be(0);
        email.Sent.Should().ContainSingle().Which.To.Should().Be(withEmail.Email);
        (await ReminderSentAtAsync(eligible)).Should().NotBeNull();
        (await ReminderSentAtAsync(cancelled)).Should().BeNull();
        (await ReminderSentAtAsync(noEmail)).Should().BeNull();
        (await ReminderSentAtAsync(bookedLate)).Should().BeNull();
        (await ReminderSentAtAsync(alreadySent)).Should().Be(now.AddHours(-1));
    }

    [Fact]
    public async Task Concurrent_runs_send_each_reminder_exactly_once()
    {
        var now = RandomNow();
        var patient = await CreatePatientAsync(email: true);
        var ids = new List<Guid>();
        for (var i = 0; i < 15; i++)
        {
            // 15 min larg njëri-tjetrit, të gjithë brenda 22–26h, pa mbivendosje te i njëjti doktor.
            ids.Add(await CreateAppointmentAsync(patient, now.AddHours(22).AddMinutes(1 + i * 15), bookedAt: now.AddDays(-2)));
        }

        await SetLastCompletedAsync(now.AddMinutes(-15));

        // Një email "i ngadaltë" e zgjeron dritaren e garës: kur njëri ekzekutim po dërgon,
        // tjetri ka kohë të arrijë te i njëjti termin.
        var email = new RecordingEmailService(delay: TimeSpan.FromMilliseconds(20));
        var start = new TaskCompletionSource();
        var runs = Enumerable.Range(0, 6).Select(async _ =>
        {
            await start.Task;
            return await RunAsync(now, email);
        }).ToList();
        start.SetResult();
        var results = await Task.WhenAll(runs);

        email.Sent.Should().HaveCount(15);
        email.Sent.Select(s => s.Subject + s.Html).Distinct().Should().HaveCount(15, "çdo termin vetëm një email");
        results.Sum(r => r.Sent).Should().Be(15);
        foreach (var id in ids)
        {
            (await ReminderSentAtAsync(id)).Should().NotBeNull();
        }
    }

    [Fact]
    public async Task Reschedule_through_api_gives_new_time_a_fresh_reminder()
    {
        var client = _factory.CreateClient();
        var auth = await TestHelpers.RegisterPatientAsync(client);
        client.WithToken(auth.AccessToken);
        var day = TestHelpers.NextMonday().AddDays(21);

        var created = await client.PostAsJsonAsync("/api/appointments", new CreateAppointmentRequest
        {
            DoctorId = DbSeeder.Ids.DoctorArben,
            ClinicBranchId = DbSeeder.Ids.BranchDardania,
            MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
            StartDateTime = day.ToDateTime(new TimeOnly(15, 0))
        }, TestHelpers.Json);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var original = (await created.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json))!;

        // Kujtesa për orën e vjetër "është dërguar".
        await WithDbAsync(db => db.Appointments.Where(a => a.Id == original.Id)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.ReminderSentAt, DateTime.UtcNow)));

        var rescheduled = await client.PostAsJsonAsync($"/api/appointments/{original.Id}/reschedule",
            new RescheduleAppointmentRequest { NewStartDateTime = day.ToDateTime(new TimeOnly(16, 0)) }, TestHelpers.Json);
        rescheduled.StatusCode.Should().Be(HttpStatusCode.OK);
        var replacement = (await rescheduled.Content.ReadFromJsonAsync<AppointmentDto>(TestHelpers.Json))!;

        (await ReminderSentAtAsync(replacement.Id)).Should().BeNull("ora e re s'ka marrë ende kujtesë");

        // Puna, 23 orë para orës së RE, dërgon kujtesën për të — dhe asgjë për origjinalin (Rescheduled).
        var newStartUtc = await WithDbAsync(db => db.Appointments.Where(a => a.Id == replacement.Id)
            .Select(a => a.StartDateTime).FirstAsync());
        var now = newStartUtc.AddHours(-23);
        await SetLastCompletedAsync(now.AddMinutes(-15));

        var email = new RecordingEmailService();
        await RunAsync(now, email);

        email.SentTo(auth.Email).Should().ContainSingle()
            .Which.Text.Should().Contain("16:00");
        (await ReminderSentAtAsync(replacement.Id)).Should().NotBeNull();
    }

    [Fact]
    public async Task Moving_an_appointment_in_place_resets_its_reminder()
    {
        // Sot riplanifikimi krijon rresht të ri (testi më lart); ky mbulon rrjetën e sigurisë
        // te AuditableEntityInterceptor për çdo rrugë të ardhshme që e zhvendos në vend.
        var now = RandomNow();
        var patient = await CreatePatientAsync(email: true);
        var id = await CreateAppointmentAsync(patient, now.AddHours(30), bookedAt: now.AddDays(-2), reminderSentAt: now);

        await WithDbAsync(async db =>
        {
            var appointment = await db.Appointments.SingleAsync(a => a.Id == id);
            appointment.StartDateTime = appointment.StartDateTime.AddHours(2);
            appointment.EndDateTime = appointment.EndDateTime.AddHours(2);
            return await db.SaveChangesAsync();
        });

        (await ReminderSentAtAsync(id)).Should().BeNull();
    }

    [Fact]
    public async Task Quota_ceiling_leaves_reminders_unmarked_and_next_run_sends_them()
    {
        var now = RandomNow();
        var patient = await CreatePatientAsync(email: true);
        // Sapo hynë në dritare (pak para 26h).
        var a1 = await CreateAppointmentAsync(patient, now.AddHours(25).AddMinutes(50), bookedAt: now.AddDays(-4));
        var a2 = await CreateAppointmentAsync(patient, now.AddHours(25).AddMinutes(53), bookedAt: now.AddDays(-4));
        var a3 = await CreateAppointmentAsync(patient, now.AddHours(25).AddMinutes(56), bookedAt: now.AddDays(-4));
        await SetLastCompletedAsync(now.AddMinutes(-15));

        // EmailSendAttempts ndahet me testet e tjera (i njëjti DB) dhe guard-i numëron çdo rresht
        // pas fillimit të dritares — prandaj tavani ndërtohet mbi atë që ekziston, si te
        // EmailAbuseLimitsTests. Dy kujtesa "të dërguara" 23 orë më parë + vend për një tani.
        var existing = await ReminderAttemptsSinceAsync(now.AddHours(-24));
        await WithDbAsync(db =>
        {
            db.EmailSendAttempts.AddRange(
                new EmailSendAttempt { NormalizedEmail = "X@TEST.DEV", Purpose = EmailSendPurpose.AppointmentReminder, CreatedAt = now.AddHours(-23) },
                new EmailSendAttempt { NormalizedEmail = "Y@TEST.DEV", Purpose = EmailSendPurpose.AppointmentReminder, CreatedAt = now.AddHours(-23) });
            return db.SaveChangesAsync();
        });

        var email = new RecordingEmailService();
        var first = await RunAsync(now, email, reminderLimit: existing + 3);

        first.Outcome.Should().Be(ReminderRunOutcome.Incomplete);
        first.Sent.Should().Be(1);
        first.DeferredByQuota.Should().Be(2);
        (await ReminderSentAtAsync(a1)).Should().NotBeNull();
        (await ReminderSentAtAsync(a2)).Should().BeNull();
        (await ReminderSentAtAsync(a3)).Should().BeNull();
        (await LastCompletedAsync()).Should().Be(now.AddMinutes(-15), "një ekzekutim i papërfunduar s'e shtyn mbulimin");

        // 4 orë më vonë dy tentativat e vjetra kanë dalë nga dritarja 24-orëshe. Terminet janë
        // tani ~21.9h larg — nën dritaren normale — por mbulimi s'përparoi, pra rikuperohen.
        var later = now.AddHours(4);
        var existingLater = await ReminderAttemptsSinceAsync(later.AddHours(-24)); // përfshin dërgimin e ekzekutimit të parë
        var second = await RunAsync(later, email, reminderLimit: existingLater + 2);

        second.Outcome.Should().Be(ReminderRunOutcome.Completed);
        second.Sent.Should().Be(2);
        email.Sent.Should().HaveCount(3);
        (await ReminderSentAtAsync(a2)).Should().NotBeNull();
        (await ReminderSentAtAsync(a3)).Should().NotBeNull();
    }

    [Fact]
    public async Task Without_resend_key_nothing_is_sent_or_marked()
    {
        var now = RandomNow();
        var patient = await CreatePatientAsync(email: true);
        var id = await CreateAppointmentAsync(patient, now.AddHours(23), bookedAt: now.AddDays(-2));
        await SetLastCompletedAsync(now.AddHours(-1));

        var email = new RecordingEmailService();
        var result = await RunAsync(now, email, resendApiKey: "");

        result.Outcome.Should().Be(ReminderRunOutcome.NoEmailProvider);
        email.Sent.Should().BeEmpty();
        (await ReminderSentAtAsync(id)).Should().BeNull();
        (await LastCompletedAsync()).Should().Be(now.AddHours(-1));
    }

    [Fact]
    public async Task Disabled_does_nothing()
    {
        var now = RandomNow();
        var patient = await CreatePatientAsync(email: true);
        var id = await CreateAppointmentAsync(patient, now.AddHours(23), bookedAt: now.AddDays(-2));

        var email = new RecordingEmailService();
        var result = await RunAsync(now, email, enabled: false);

        result.Outcome.Should().Be(ReminderRunOutcome.Disabled);
        email.Sent.Should().BeEmpty();
        (await ReminderSentAtAsync(id)).Should().BeNull();
    }

    [Fact]
    public async Task After_sleeping_it_catches_up_but_never_under_two_hours_or_in_the_past()
    {
        var now = RandomNow();
        var patient = await CreatePatientAsync(email: true);
        // Procesi "fjeti" 10 orë: termini pas 18h ishte në dritaren e vet (22–26h) gjatë gjumit.
        var missedDuringSleep = await CreateAppointmentAsync(patient, now.AddHours(18), bookedAt: now.AddDays(-3));
        var tooSoon = await CreateAppointmentAsync(patient, now.AddHours(1.5), bookedAt: now.AddDays(-3));
        var past = await CreateAppointmentAsync(patient, now.AddHours(-1), bookedAt: now.AddDays(-3));
        await SetLastCompletedAsync(now.AddHours(-10));

        var email = new RecordingEmailService();
        var result = await RunAsync(now, email);

        result.Outcome.Should().Be(ReminderRunOutcome.Completed);
        email.Sent.Should().ContainSingle();
        (await ReminderSentAtAsync(missedDuringSleep)).Should().NotBeNull();
        (await ReminderSentAtAsync(tooSoon)).Should().BeNull();
        (await ReminderSentAtAsync(past)).Should().BeNull();
        (await LastCompletedAsync()).Should().Be(now);
    }

    [Theory]
    // Fundi i orës verore 2030: e diel 27 tetor, 01:00 UTC (03:00 CEST → 02:00 CET).
    // Puna ekzekutohet NË CEST (UTC+2), termini është PAS ndërrimit (UTC+1): ora e saktë 10:00.
    // Nëse dikush do të përdorte ofset-in e momentit të dërgimit, do të dilte 11:00.
    [InlineData("2030-10-26T10:00:00Z", "2030-10-27T09:00:00Z", "10:00", "e diel, 27 tetor 2030")]
    // Puna PAS ndërrimit, termini të hënën (CET): 08:00 UTC → 09:00.
    [InlineData("2030-10-27T09:00:00Z", "2030-10-28T08:00:00Z", "09:00", "e hënë, 28 tetor 2030")]
    // Data ndryshon nga ofset-i: 23:30 UTC të dielën është 00:30 e së hënës në Prishtinë.
    [InlineData("2030-10-27T00:30:00Z", "2030-10-27T23:30:00Z", "00:30", "e hënë, 28 tetor 2030")]
    public async Task Email_shows_belgrade_time_across_the_october_dst_change(
        string nowUtc, string startUtc, string expectedTime, string expectedDate)
    {
        var now = DateTime.Parse(nowUtc, null, System.Globalization.DateTimeStyles.AdjustToUniversal);
        var start = DateTime.Parse(startUtc, null, System.Globalization.DateTimeStyles.AdjustToUniversal);
        var patient = await CreatePatientAsync(email: true);
        await CreateAppointmentAsync(patient, start, bookedAt: start.AddDays(-7));
        await SetLastCompletedAsync(now.AddMinutes(-15));

        var email = new RecordingEmailService();
        await RunAsync(now, email);

        var sent = email.SentTo(patient.Email!).Should().ContainSingle().Subject;
        sent.Text.Should().Contain($"Ora: {expectedTime}").And.Contain($"Data: {expectedDate}");
        sent.Html.Should().Contain(expectedTime);
    }

    // ------------------------------------------------------------------ helpers

    private static DateTime RandomNow() =>
        new DateTime(2000, 1, 1, 0, 0, 0, DateTimeKind.Utc)
            .AddDays(Random.Shared.Next(0, 9000))
            .AddMinutes(Random.Shared.Next(0, 24 * 60));

    private async Task<ReminderRunResult> RunAsync(
        DateTime now, RecordingEmailService email, int reminderLimit = 50, string resendApiKey = "re_test", bool enabled = true)
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<BookingDbContext>();
        var clock = new ManualClock { UtcNow = now };

        var limits = new EmailAbuseLimitSettings();
        limits.PurposeWindowLimits[EmailSendPurpose.AppointmentReminder] = reminderLimit;
        var guard = new EmailAbuseGuard(db, clock, Options.Create(limits), NullLogger<EmailAbuseGuard>.Instance);

        var service = new AppointmentReminderService(
            db, email, guard, clock, new TimeZoneService(),
            Options.Create(new ReminderSettings { Enabled = enabled }),
            Options.Create(new BookingSettings()),
            Options.Create(new FrontendSettings { BaseUrl = "https://www.example.test" }),
            Options.Create(new ResendSettings { ApiKey = resendApiKey, FromAddress = "Rezervo <noreply@example.test>" }),
            NullLogger<AppointmentReminderService>.Instance);

        return await service.RunOnceAsync();
    }

    private async Task<ApplicationUser> CreatePatientAsync(bool email)
    {
        var id = Guid.NewGuid();
        var address = email ? $"kujtese-{id:N}@test.dev" : null;
        var user = new ApplicationUser
        {
            Id = id,
            UserName = $"kujtese-{id:N}",
            NormalizedUserName = $"KUJTESE-{id:N}".ToUpperInvariant(),
            Email = address,
            NormalizedEmail = address?.ToUpperInvariant(),
            PhoneNumber = "+38344123456",
            FirstName = "Drita",
            LastName = "Krasniqi",
            SecurityStamp = Guid.NewGuid().ToString()
        };

        await WithDbAsync(db =>
        {
            db.Users.Add(user);
            db.PatientProfiles.Add(new PatientProfile { UserId = id, DateOfBirth = new DateOnly(1990, 1, 1), Gender = Gender.Female });
            return db.SaveChangesAsync();
        });

        return user;
    }

    /// <summary>
    /// Shton terminin direkt në DB dhe pastaj ia vendos CreatedAt-in me ExecuteUpdate — interceptor-i
    /// do ta mbishkruante me orën reale, ndërsa rregulli "rezervuar ≥24h përpara" varet prej tij.
    /// </summary>
    private async Task<Guid> CreateAppointmentAsync(
        ApplicationUser patient, DateTime startUtc, DateTime bookedAt,
        AppointmentStatus status = AppointmentStatus.Confirmed, DateTime? reminderSentAt = null)
    {
        var id = Guid.NewGuid();
        await WithDbAsync(async db =>
        {
            var profileId = await db.PatientProfiles.Where(p => p.UserId == patient.Id).Select(p => p.Id).SingleAsync();
            db.Appointments.Add(new Appointment
            {
                Id = id,
                ClinicId = DbSeeder.Ids.ClinicDardania,
                ClinicBranchId = DbSeeder.Ids.BranchDardania,
                DoctorId = DbSeeder.Ids.DoctorArben,
                MedicalServiceId = DbSeeder.Ids.ServiceDentalCleaning,
                PatientProfileId = profileId,
                StartDateTime = startUtc,
                EndDateTime = startUtc.AddMinutes(2),
                Status = status,
                ReminderSentAt = reminderSentAt
            });
            await db.SaveChangesAsync();
            return await db.Appointments.Where(a => a.Id == id)
                .ExecuteUpdateAsync(s => s.SetProperty(a => a.CreatedAt, bookedAt));
        });
        return id;
    }

    private Task<DateTime?> ReminderSentAtAsync(Guid appointmentId) =>
        WithDbAsync(db => db.Appointments.Where(a => a.Id == appointmentId).Select(a => a.ReminderSentAt).SingleAsync());

    private Task<int> ReminderAttemptsSinceAsync(DateTime windowStart) =>
        WithDbAsync(db => db.EmailSendAttempts.CountAsync(a =>
            a.Purpose == EmailSendPurpose.AppointmentReminder && a.CreatedAt >= windowStart));

    private Task<DateTime?> LastCompletedAsync() =>
        WithDbAsync(db => db.BackgroundJobStates.Where(s => s.Name == AppointmentReminderService.JobName)
            .Select(s => (DateTime?)s.LastCompletedAt).SingleOrDefaultAsync());

    private Task SetLastCompletedAsync(DateTime value) =>
        WithDbAsync(db => db.Database.ExecuteSqlInterpolatedAsync(
            $"""
             INSERT INTO "BackgroundJobStates" ("Name", "LastCompletedAt") VALUES ({AppointmentReminderService.JobName}, {value})
             ON CONFLICT ("Name") DO UPDATE SET "LastCompletedAt" = EXCLUDED."LastCompletedAt"
             """));

    private async Task<T> WithDbAsync<T>(Func<BookingDbContext, Task<T>> action)
    {
        using var scope = _factory.Services.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<BookingDbContext>());
    }

    private sealed class RecordingEmailService(TimeSpan? delay = null) : IEmailService
    {
        public ConcurrentQueue<(string To, string Subject, string Html, string Text)> Queue { get; } = new();

        public IReadOnlyList<(string To, string Subject, string Html, string Text)> Sent => Queue.ToList();

        public IEnumerable<(string To, string Subject, string Html, string Text)> SentTo(string to) =>
            Sent.Where(s => s.To == to);

        public async Task SendAsync(string toEmail, string subject, string htmlBody, string textBody, CancellationToken cancellationToken = default)
        {
            if (delay is { } d)
            {
                await Task.Delay(d, cancellationToken);
            }

            Queue.Enqueue((toEmail, subject, htmlBody, textBody));
        }
    }
}
