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

/// <summary>Të dhënat minimale për një njoftim termini drejtuar stafit (doktori/klinika), jo pacientit.</summary>
public sealed record AppointmentStaffNotificationContext
{
    public required Guid AppointmentId { get; init; }
    public required string PatientName { get; init; }
    public required string DoctorName { get; init; }
    /// <summary>Null kur vetë doktori e ka kryer veprimin — s'ka nevojë të njoftohet për të.</summary>
    public string? DoctorEmail { get; init; }
    public required string ClinicName { get; init; }
    /// <summary>Bosh kur vetë klinika (ClinicAdmin) e ka kryer veprimin.</summary>
    public IReadOnlyList<string> ClinicAdminEmails { get; init; } = [];
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
    /// <summary>
    /// Rezervimi konfirmohet direkt në momentin e krijimit (s'ka hap të veçantë rishikimi) —
    /// përdoret si për rezervim të ri, ashtu edhe për riplanifikim.
    /// </summary>
    Task AppointmentConfirmedAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentCancelledAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentRescheduledAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentReminderAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);

    /// <summary>Pacienti ka një termin që përplaset me një paarritshmëri të re të doktorit.</summary>
    Task AppointmentUnavailabilityConflictAsync(AppointmentNotificationContext context, CancellationToken cancellationToken = default);

    // ---------- Njoftime për stafin (doktori dhe/ose administratorët e klinikës) ----------

    Task AppointmentCreatedForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentCancelledForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentRescheduledForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentNoShowForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default);
    Task AppointmentUnavailabilityConflictForStaffAsync(AppointmentStaffNotificationContext context, CancellationToken cancellationToken = default);
}
