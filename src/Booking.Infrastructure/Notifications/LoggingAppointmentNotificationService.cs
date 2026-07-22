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

    public Task AppointmentCreatedAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "U krijua rezervimi",
            $"Termini juaj te {context.DoctorName} ({context.ClinicName}) më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm} u pranua dhe pret konfirmim.",
            cancellationToken);

    public Task AppointmentConfirmedAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "Termini u konfirmua",
            $"Termini juaj te {context.DoctorName} më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm} u konfirmua.",
            cancellationToken);

    public Task AppointmentCancelledAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "Termini u anulua",
            $"Termini juaj te {context.DoctorName} më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm} u anulua.",
            cancellationToken);

    public Task AppointmentRescheduledAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "Termini u riplanifikua",
            $"Termini juaj te {context.DoctorName} u zhvendos më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm}.",
            cancellationToken);

    public Task AppointmentReminderAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default) =>
        SendAsync(context, "Kujtesë termini",
            $"Ju kujtojmë terminin te {context.DoctorName} ({context.ClinicName}) më {context.StartDateTimeLocal:dd.MM.yyyy HH:mm}.",
            cancellationToken);

    private async Task SendAsync(
        AppointmentNotificationContext context, string subject, string body, CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Njoftim termini {AppointmentId}: {Subject}", context.AppointmentId, subject);

        await _emailService.SendAsync(context.PatientEmail, subject, body, cancellationToken);

        if (!string.IsNullOrWhiteSpace(context.PatientPhoneNumber))
        {
            await _smsService.SendAsync(context.PatientPhoneNumber, body, cancellationToken);
        }
    }
}
