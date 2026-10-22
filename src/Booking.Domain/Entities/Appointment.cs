using Booking.Domain.Common;
using Booking.Domain.Enums;
using Booking.Domain.ValueObjects;

namespace Booking.Domain.Entities;

/// <summary>
/// Termini i rezervuar. Datat ruhen në UTC. Mbrojtja nga double-booking:
/// exclusion constraint në PostgreSQL + optimistic concurrency (xmin) + kontroll aplikativ.
/// </summary>
public class Appointment : AuditableEntity
{
    public Guid ClinicId { get; set; }
    public Guid ClinicBranchId { get; set; }
    public Guid DoctorId { get; set; }
    public Guid MedicalServiceId { get; set; }
    public Guid PatientProfileId { get; set; }

    /// <summary>Null = termini është për vetë pacientin; ndryshe për fëmijën/dependentin e tij.</summary>
    public Guid? DependentId { get; set; }

    public DateTime StartDateTime { get; set; }
    public DateTime EndDateTime { get; set; }
    public AppointmentStatus Status { get; set; } = AppointmentStatus.Confirmed;

    /// <summary>
    /// Concurrency token — mapohet te kolona e sistemit xmin e PostgreSQL (asnjë kolonë shtesë).
    /// UPDATE konkurrent me vlerë të vjetër → DbUpdateConcurrencyException.
    /// </summary>
    public uint Version { get; set; }

    public string? PatientNote { get; set; }
    public string? InternalNote { get; set; }
    public string? CancellationReason { get; set; }
    public Guid? CancelledByUserId { get; set; }
    public DateTime? CancelledAt { get; set; }

    /// <summary>
    /// Kur u "mor" kujtesa me email ~24 orë para terminit (shih AppointmentReminderService).
    /// Vendoset ATOMIKISHT para dërgimit (UPDATE ... WHERE "ReminderSentAt" IS NULL) — kjo
    /// është garancia kundër dërgimit të dyfishtë kur dy ekzekutime/instanca garojnë.
    /// Riplanifikimi krijon termin të ri (me këtë fushë null), pra kujtesa shkon për orën e re.
    /// </summary>
    public DateTime? ReminderSentAt { get; set; }

    /// <summary>
    /// True kur termini u rezervua nga stafi i klinikës (p.sh. me telefon), jo nga pacienti.
    /// Kush saktësisht e rezervoi ruhet në AuditLog (APPOINTMENT_CREATED_BY_ADMIN).
    /// </summary>
    public bool BookedByClinic { get; set; }

    /// <summary>
    /// Çmimi i dakorduar në momentin e rezervimit (DoctorService.CustomPrice ?? MedicalService.Price).
    /// Ndryshimi i çmimit të shërbimit më vonë vlen vetëm për rezervimet e reja. Null për
    /// terminet e krijuara para kësaj kolone — për to çmimi lexohet nga vlerat aktuale
    /// në momentin e leximit (rreshtat e vjetër s'rishkruhen).
    /// </summary>
    public decimal? Price { get; set; }

    public string? Currency { get; set; }

    public Clinic Clinic { get; set; } = null!;
    public ClinicBranch ClinicBranch { get; set; } = null!;
    public Doctor Doctor { get; set; } = null!;
    public MedicalService MedicalService { get; set; } = null!;
    public PatientProfile PatientProfile { get; set; } = null!;
    public Dependent? Dependent { get; set; }

    /// <summary>Statuset që zënë kalendar — vetëm këto marrin pjesë në kontrollin e mbivendosjes.</summary>
    public static readonly AppointmentStatus[] BlockingStatuses =
    [
        AppointmentStatus.Pending,
        AppointmentStatus.Confirmed,
        AppointmentStatus.CheckedIn,
        AppointmentStatus.InProgress
    ];

    public bool IsBlocking => BlockingStatuses.Contains(Status);

    public DateTimeRange ToRange() => new(StartDateTime, EndDateTime);
}
