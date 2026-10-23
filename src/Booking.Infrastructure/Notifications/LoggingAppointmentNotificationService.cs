using Booking.Application.Common.Interfaces;
using Booking.Application.Features.Appointments;
using Microsoft.Extensions.Logging;

namespace Booking.Infrastructure.Notifications;

/// <summary>
/// V1: njoftimet dërgohen përmes mock email/SMS (logging). Kur të integrohet
/// SendGrid/Twilio ose një operator lokal, ky implementim zëvendësohet në DI —
/// idealisht i mbështjellë me një background job (Hangfire/Quartz) që dërgimi
/// të mos e vonojë përgjigjen e API-t.
/// </summary>
public class LoggingAppointmentNotificationService : IAppointmentNotificationService
{
    private readonly IEmailService _emailService;
    private readonly ISmsService _smsService;
    private readonly ILogger<LoggingAppointmentNotificationService> _logger;

    public LoggingAppointmentNotificationService(
        IEmailService emailService,
        ISmsService smsService,
        ILogger<LoggingAppointmentNotificationService> logger)
    {
        _emailService = emailService;
        _smsService = smsService;
        _logger = logger;
    }

    public Task AppointmentConfirmedAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "Termini u konfirmua",
            $"{Whose(context)} te {context.DoctorName} më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm} u konfirmua.",
            cancellationToken);

    public Task AppointmentCancelledAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "Termini u anulua",
            $"{Whose(context)} te {context.DoctorName} më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm} u anulua.",
            cancellationToken);

    public Task AppointmentRescheduledAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "Termini u riplanifikua",
            $"{Whose(context)} te {context.DoctorName} u zhvendos më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm}.",
            cancellationToken);

    public Task AppointmentUnavailabilityConflictAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "Mundësi konflikti me terminin tuaj",
            $"Doktori shënoi paarritshmëri që përplaset me {WhoseLower(context)} te {context.DoctorName} më " +
            $"{context.StartDateTimeLocal:dd.MM.yyyy HH:mm}. Klinika {context.ClinicName} do t'ju kontaktojë për riplanifikim.",
            cancellationToken);

    public Task AppointmentCreatedForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default) =>
        SendStaffAsync(context, "Rezervim i ri",
            $"{Who(context)} rezervoi një termin te {context.DoctorName} ({context.ClinicName}) më " +
            $"{context.StartDateTimeLocal:dd.MM.yyyy HH:mm}.",
            cancellationToken);

    public Task AppointmentCancelledForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default) =>
        SendStaffAsync(context, "Termin i anuluar",
            $"Termini i {Who(context)} te {context.DoctorName} më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm} u anulua.",
            cancellationToken);

    public Task AppointmentRescheduledForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default) =>
        SendStaffAsync(context, "Termin i riplanifikuar",
            $"Termini i {Who(context)} te {context.DoctorName} u zhvendos më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm}.",
            cancellationToken);

    public Task AppointmentNoShowForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default) =>
        SendStaffAsync(context, "Pacienti nuk u paraqit",
            $"{Who(context)} nuk u paraqit te {context.DoctorName} për terminin e {context.StartDateTimeLocal:dd.MM.yyyy HH:mm}.",
            cancellationToken);

    public Task AppointmentUnavailabilityConflictForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default) =>
        SendStaffAsync(context, "Konflikt: paarritshmëri e re",
            $"{context.DoctorName} shënoi paarritshmëri që përplaset me terminin e konfirmuar të {Who(context)} më " +
            $"{context.StartDateTimeLocal:dd.MM.yyyy HH:mm}. Kontaktoni pacientin për riplanifikim.",
            cancellationToken);

    /// <summary>
    /// Një email për doktor (nëse s'e ka kryer ai vetë veprimin) dhe një për secilin
    /// administrator klinike (nëse veprimi s'u krye nga vetë klinika) — dy audienca,
    /// jo një broadcast i vetëm, sepse ClinicAdminEmails mund të ketë shumë marrës.
    /// </summary>
    private async Task SendStaffAsync(
        AppointmentStaffNotificationContext context, string subject, string body, CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Njoftim stafi për terminin {AppointmentId}: {Subject}", context.AppointmentId, subject);

        var htmlBody = $"""<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#131718;">{System.Net.WebUtility.HtmlEncode(body)}</p>""";

        if (!string.IsNullOrWhiteSpace(context.DoctorEmail))
        {
            await _emailService.SendAsync(context.DoctorEmail, subject, htmlBody, body, cancellationToken);
        }

        foreach (var clinicAdminEmail in context.ClinicAdminEmails)
        {
            if (!string.IsNullOrWhiteSpace(clinicAdminEmail))
            {
                await _emailService.SendAsync(clinicAdminEmail, subject, htmlBody, body, cancellationToken);
            }
        }
    }

    /// <summary>"Arben Gashi" ose "Arben Gashi (për Lira Gashi)" — për stafin.</summary>
    private static string Who(AppointmentStaffNotificationContext context) =>
        context.DependentName is null ? context.PatientName : $"{context.PatientName} (për {context.DependentName})";

    /// <summary>"Termini juaj" ose "Termini për Lira Pacienti" — kush e ka terminin në të vërtetë.</summary>
    private static string Whose(AppointmentNotificationContext context) =>
        context.DependentName is null ? "Termini juaj" : $"Termini për {context.DependentName}";

    private static string WhoseLower(AppointmentNotificationContext context) =>
        context.DependentName is null ? "terminin tuaj" : $"terminin për {context.DependentName}";

    private async Task SendAsync(
        AppointmentNotificationContext context, string subject, string body, CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Njoftim termini {AppointmentId}: {Subject}", context.AppointmentId, subject);

        // Email-i mungon te pacientët e krijuar me telefon nga recepsioni. Thirrja e SMS-së
        // më poshtë ekziston për kur të integrohet një operator — sot LoggingSmsService vetëm
        // logon, pra këta pacientë NUK marrin asgjë. Mos premto SMS në UI pa e ndryshuar këtë.
        //
        // Jashtë fushëveprimit të shabllonizimit HTML (shih EmailTemplates) — këto janë
        // fjali të vetme, pa nevojë për markup; mbështillen minimalisht vetëm që të mos
        // rregresojnë (më parë shkonin si "text" i papërpunuar te Resend, tani duhet
        // gjithsesi një "html", ndryshe do të dilnin bosh për marrësit që shohin HTML).
        if (!string.IsNullOrWhiteSpace(context.PatientEmail))
        {
            var htmlBody = $"""<p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#131718;">{System.Net.WebUtility.HtmlEncode(body)}</p>""";
            await _emailService.SendAsync(context.PatientEmail, subject, htmlBody, body, cancellationToken);
        }

        if (!string.IsNullOrWhiteSpace(context.PatientPhoneNumber))
        {
            await _smsService.SendAsync(context.PatientPhoneNumber, body, cancellationToken);
        }
    }
}
