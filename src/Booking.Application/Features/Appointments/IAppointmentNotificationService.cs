namespace Booking.Application.Features.Appointments;

/// <summary>Të dhënat minimale për një njoftim termini — pa të dhëna mjekësore.</summary>
public sealed record AppointmentNotificationContext
{
    public required Guid AppointmentId { get; init; }
    /// <summary>
    /// Null për pacientët e krijuar nga administrata që s'kanë dhënë email
    /// (rezervim me telefon) — atyre u shkon vetëm SMS.
    /// </summary>
    public string? PatientEmail { get; init; }
    public string? PatientPhoneNumber { get; init; }
    public required string PatientName { get; init; }
    public required string DoctorName { get; init; }
    public required string ClinicName { get; init; }
    public required string ServiceName { get; init; }

    /// <summary>Ora lokale e Prishtinës.</summary>
    public required DateTime StartDateTimeLocal { get; init; }
}

/// <summary>
/// Njoftimet e termineve. V1: implementim logging. Struktura është gati për
/// background jobs (Hangfire/Quartz) + SendGrid/Twilio/operator lokal SMS —
/// mjafton të zëvendësohet implementimi në DI. Dështimi i njoftimit NUK dështon rezervimin.
/// </summary>
public interface IAppointmentNotificationService
{
    Task AppointmentCreatedAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentConfirmedAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentCancelledAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentRescheduledAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentReminderAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);
}
