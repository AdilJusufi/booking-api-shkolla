using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Domain.Enums;
using Booking.Infrastructure.Notifications.Templates;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Notifications;

public enum ReminderRunOutcome
{
    /// <summary>Reminders:Enabled=false — asgjë s'u prek.</summary>
    Disabled,

    /// <summary>S'ka Resend ApiKey/FromAddress (zhvillim) — asgjë s'u shënua si e dërguar.</summary>
    NoEmailProvider,

    /// <summary>Çdo kandidat u trajtua; dritarja e mbuluar përparoi.</summary>
    Completed,

    /// <summary>Disa kujtesa mbetën (kuota ose dështim dërgimi) — ekzekutimi i radhës i rimerr.</summary>
    Incomplete
}

public sealed record ReminderRunResult(
    ReminderRunOutcome Outcome, int Sent = 0, int ClaimedElsewhere = 0, int DeferredByQuota = 0, int Failed = 0);

/// <summary>
/// Një ekzekutim i vetëm i kujtesave (AppointmentReminderBackgroundService e thërret çdo 15 min).
///
/// PA DYFISHIM — garancia: para dërgimit, termini "merret" me një UPDATE të vetëm atomik
/// <c>UPDATE "Appointments" SET "ReminderSentAt" = @t WHERE "Id" = @id AND "ReminderSentAt" IS NULL AND ...</c>.
/// Në PostgreSQL (READ COMMITTED) dy UPDATE të njëkohshme mbi të njëjtin rresht serializohen me
/// row lock: i dyti pret, pastaj e rivlerëson WHERE-in mbi versionin e ri të rreshtit, gjen
/// "ReminderSentAt" jo-null dhe prek 0 rreshta. Vetëm ai që merr 1 rresht dërgon. Kjo vlen
/// njësoj për dy ekzekutime në të njëjtin proces dhe për dy instanca të API-t.
///
/// Rendi është: merr → kuota → dërgo. Nëse kuota mungon ose dërgimi dështon, marrja lirohet
/// (ReminderSentAt kthehet null VETËM nëse është ende vula jonë), që ekzekutimi i radhës ta
/// provojë sërish. Dyfishim mbetet i mundur vetëm në një rast: Resend e pranoi email-in por
/// përgjigja humbi në të tre riprovat e ResendEmailService (që ndajnë një Idempotency-Key).
///
/// GJUMI I RENDER-IT: dritarja normale është 22–26 orë. Nëse puna s'u ekzekutua për një kohë
/// (procesi flinte, ishte fikur, ose kuota/dështimet e lanë pa përfunduar), kufiri i poshtëm
/// zgjerohet deri te pika ku mbulimi i fundit i plotë ndaloi (LastCompletedAt + 26h), por kurrë
/// nën 2 orë nga tani. Kështu një termin që "humbi" dritaren e vet merr kujtesë sapo procesi
/// zgjohet, ndërsa në punë normale (ekzekutim çdo 15 min) një termin pas 21 orësh s'merr kujtesë.
/// </summary>
public class AppointmentReminderService
{
    public const string JobName = "appointment-reminders";

    private readonly BookingDbContext _dbContext;
    private readonly IEmailService _emailService;
    private readonly IEmailAbuseGuard _emailAbuseGuard;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITimeZoneService _timeZoneService;
    private readonly ReminderSettings _settings;
    private readonly BookingSettings _bookingSettings;
    private readonly FrontendSettings _frontendSettings;
    private readonly ResendSettings _resendSettings;
    private readonly ILogger<AppointmentReminderService> _logger;

    public AppointmentReminderService(
        BookingDbContext dbContext,
        IEmailService emailService,
        IEmailAbuseGuard emailAbuseGuard,
        IDateTimeProvider dateTimeProvider,
        ITimeZoneService timeZoneService,
        IOptions<ReminderSettings> settings,
        IOptions<BookingSettings> bookingSettings,
        IOptions<FrontendSettings> frontendSettings,
        IOptions<ResendSettings> resendSettings,
        ILogger<AppointmentReminderService> logger)
    {
        _dbContext = dbContext;
        _emailService = emailService;
        _emailAbuseGuard = emailAbuseGuard;
        _dateTimeProvider = dateTimeProvider;
        _timeZoneService = timeZoneService;
        _settings = settings.Value;
        _bookingSettings = bookingSettings.Value;
        _frontendSettings = frontendSettings.Value;
        _resendSettings = resendSettings.Value;
        _logger = logger;
    }

    public async Task<ReminderRunResult> RunOnceAsync(CancellationToken cancellationToken = default)
    {
        if (!_settings.Enabled)
        {
            return new ReminderRunResult(ReminderRunOutcome.Disabled);
        }

        if (string.IsNullOrWhiteSpace(_resendSettings.ApiKey) || string.IsNullOrWhiteSpace(_resendSettings.FromAddress))
        {
            return new ReminderRunResult(ReminderRunOutcome.NoEmailProvider);
        }

        var now = TruncateToMicroseconds(_dateTimeProvider.UtcNow);
        var lastCompletedAt = await _dbContext.BackgroundJobStates
            .Where(s => s.Name == JobName)
            .Select(s => (DateTime?)s.LastCompletedAt)
            .FirstOrDefaultAsync(cancellationToken);

        var (windowFrom, windowTo) = ComputeWindow(now, lastCompletedAt, _settings);
        var minimumBookingLead = TimeSpan.FromHours(_settings.MinimumBookingLeadHours);

        // Pacientët pa email (të krijuar nga recepsioni me telefon) filtrohen këtu — s'ka çfarë
        // t'u dërgohet dhe s'është gabim; nuk "merren" fare, pra s'lënë gjurmë.
        var candidates = await (
                from a in _dbContext.Appointments
                where a.Status == AppointmentStatus.Confirmed
                      && a.ReminderSentAt == null
                      && a.StartDateTime >= windowFrom
                      && a.StartDateTime <= windowTo
                      && a.StartDateTime - a.CreatedAt >= minimumBookingLead
                join u in _dbContext.Users on a.PatientProfile.UserId equals u.Id
                where u.Email != null && u.Email != ""
                orderby a.StartDateTime
                select new ReminderRow(
                    a.Id,
                    a.StartDateTime,
                    u.Email!,
                    u.FirstName,
                    a.Dependent != null ? a.Dependent.FirstName + " " + a.Dependent.LastName : null,
                    _dbContext.Users.Where(du => du.Id == a.Doctor.UserId).Select(du => du.FirstName + " " + du.LastName).First(),
                    a.MedicalService.Specialty.Name,
                    a.MedicalService.Name,
                    a.Clinic.Name,
                    a.ClinicBranch.Name,
                    a.ClinicBranch.Address,
                    a.ClinicBranch.City,
                    a.ClinicBranch.PhoneNumber ?? a.Clinic.PhoneNumber))
            .ToListAsync(cancellationToken);

        int sent = 0, claimedElsewhere = 0, deferred = 0, failed = 0;

        for (var i = 0; i < candidates.Count; i++)
        {
            var row = candidates[i];

            if (!await TryClaimAsync(row, now, cancellationToken))
            {
                // Një ekzekutim/instancë tjetër e mori ndërkohë, ose termini u anulua/zhvendos
                // pas leximit — në të dyja rastet s'është puna jonë.
                claimedElsewhere++;
                continue;
            }

            try
            {
                var decision = await _emailAbuseGuard.TryRecordSystemSendAsync(
                    row.Email, EmailSendPurpose.AppointmentReminder, cancellationToken);
                if (decision != EmailSendDecision.Allowed)
                {
                    await ReleaseClaimAsync(row.AppointmentId, now);
                    deferred = candidates.Count - i;
                    _logger.LogWarning(
                        "Kujtesat e termineve: u arrit tavani ditor i email-eve për kujtesa — {Deferred} kujtesa " +
                        "mbetën pa u dërguar dhe NUK u shënuan; do të provohen në ekzekutimin e radhës, sapo " +
                        "dritarja 24-orëshe të lirojë vend (EmailAbuseLimits:PurposeWindowLimits:AppointmentReminder).",
                        deferred);
                    break;
                }

                var email = EmailTemplates.AppointmentReminder(BuildModel(row, now));
                await _emailService.SendAsync(row.Email, email.Subject, email.Html, email.Text, cancellationToken);
                sent++;
            }
            catch (OperationCanceledException)
            {
                // Mbyllje e procesit në mes — lirohet që ta marrë ekzekutimi i ardhshëm.
                await ReleaseClaimAsync(row.AppointmentId, now);
                throw;
            }
            catch (Exception ex)
            {
                await ReleaseClaimAsync(row.AppointmentId, now);
                failed++;
                _logger.LogError(ex,
                    "Kujtesa për terminin {AppointmentId} dështoi të dërgohej — do të provohet sërish në ekzekutimin e radhës.",
                    row.AppointmentId);
            }
        }

        var outcome = deferred == 0 && failed == 0 ? ReminderRunOutcome.Completed : ReminderRunOutcome.Incomplete;
        if (outcome == ReminderRunOutcome.Completed)
        {
            await MarkCompletedAsync(now, cancellationToken);
        }

        if (sent > 0 || deferred > 0 || failed > 0)
        {
            _logger.LogInformation(
                "Kujtesat e termineve: {Sent} u dërguan, {Deferred} u shtynë (kuota), {Failed} dështuan, " +
                "{ClaimedElsewhere} i mori tjetërkush. Dritarja {From:u} – {To:u}.",
                sent, deferred, failed, claimedElsewhere, windowFrom, windowTo);
        }

        return new ReminderRunResult(outcome, sent, claimedElsewhere, deferred, failed);
    }

    /// <summary>E publikuar për testet — i gjithë arsyetimi i dritares është këtu.</summary>
    public static (DateTime From, DateTime To) ComputeWindow(DateTime now, DateTime? lastCompletedAt, ReminderSettings settings)
    {
        var to = now.AddHours(settings.WindowEndHours);
        var from = now.AddHours(settings.WindowStartHours);

        if (lastCompletedAt is { } last)
        {
            // Çdo termin që nis pas last+26h s'ka qenë kurrë brenda dritares së një ekzekutimi të
            // përfunduar. Në punë normale (last = 15 min më parë) kjo është pas now+22h, pra
            // s'ndryshon asgjë; pas një gjumi të gjatë e ul kufirin e poshtëm.
            var uncoveredFrom = (last < now ? last : now).AddHours(settings.WindowEndHours);
            if (uncoveredFrom < from)
            {
                from = uncoveredFrom;
            }
        }

        var floor = now.AddHours(settings.MinimumLeadHours);
        if (from < floor)
        {
            from = floor;
        }

        return (from, to);
    }

    private AppointmentReminderEmailModel BuildModel(ReminderRow row, DateTime now)
    {
        var baseUrl = _frontendSettings.BaseUrl?.TrimEnd('/');
        var canStillCancel = now < row.StartUtc.AddHours(-_bookingSettings.CancellationCutoffHours);

        return new AppointmentReminderEmailModel
        {
            RecipientFirstName = row.RecipientFirstName,
            DependentFullName = row.DependentFullName,
            DoctorName = row.DoctorName,
            SpecialtyName = row.SpecialtyName,
            ServiceName = row.ServiceName,
            ClinicName = row.ClinicName,
            BranchName = row.BranchName,
            BranchAddress = row.BranchAddress,
            BranchCity = row.BranchCity,
            ClinicPhoneNumber = string.IsNullOrWhiteSpace(row.ContactPhone) ? null : row.ContactPhone,
            StartLocal = _timeZoneService.ToLocal(row.StartUtc),
            CancelUrl = canStillCancel && !string.IsNullOrWhiteSpace(baseUrl)
                ? $"{baseUrl}/terminet/{row.AppointmentId}"
                : null
        };
    }

    /// <summary>
    /// Kushtet e statusit dhe të orës përsëriten në WHERE: nëse termini u anulua ose u zhvendos
    /// mes leximit dhe marrjes, UPDATE-i prek 0 rreshta dhe s'dërgohet asgjë.
    /// </summary>
    private async Task<bool> TryClaimAsync(ReminderRow row, DateTime stamp, CancellationToken cancellationToken)
    {
        var affected = await _dbContext.Appointments
            .Where(a => a.Id == row.AppointmentId
                        && a.ReminderSentAt == null
                        && a.Status == AppointmentStatus.Confirmed
                        && a.StartDateTime == row.StartUtc)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.ReminderSentAt, stamp), cancellationToken);

        return affected == 1;
    }

    /// <summary>Vetëm nëse vula është ende e jona — kurrë s'fshin marrjen e dikujt tjetër.</summary>
    private Task ReleaseClaimAsync(Guid appointmentId, DateTime stamp) =>
        _dbContext.Appointments
            .Where(a => a.Id == appointmentId && a.ReminderSentAt == stamp)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.ReminderSentAt, (DateTime?)null), CancellationToken.None);

    /// <summary>GREATEST: një ekzekutim më i vjetër që mbaron më vonë s'e kthen dot vlerën pas.</summary>
    private Task MarkCompletedAsync(DateTime now, CancellationToken cancellationToken) =>
        _dbContext.Database.ExecuteSqlInterpolatedAsync(
            $"""
             INSERT INTO "BackgroundJobStates" ("Name", "LastCompletedAt") VALUES ({JobName}, {now})
             ON CONFLICT ("Name") DO UPDATE SET "LastCompletedAt" = GREATEST("BackgroundJobStates"."LastCompletedAt", EXCLUDED."LastCompletedAt")
             """,
            cancellationToken);

    /// <summary>PostgreSQL ruan mikrosekonda; pa këtë, krahasimi i vulës te ReleaseClaimAsync s'do të përputhej.</summary>
    private static DateTime TruncateToMicroseconds(DateTime value) =>
        new(value.Ticks - value.Ticks % 10, DateTimeKind.Utc);

    private sealed record ReminderRow(
        Guid AppointmentId,
        DateTime StartUtc,
        string Email,
        string RecipientFirstName,
        string? DependentFullName,
        string DoctorName,
        string SpecialtyName,
        string ServiceName,
        string ClinicName,
        string BranchName,
        string BranchAddress,
        string BranchCity,
        string? ContactPhone);
}
