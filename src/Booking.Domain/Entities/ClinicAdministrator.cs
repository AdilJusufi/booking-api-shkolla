using Booking.Domain.Common;

namespace Booking.Domain.Entities;

/// <summary>Caktimi i një përdoruesi me rol ClinicAdmin te një klinikë — baza e tenant isolation.</summary>
public class ClinicAdministrator : AuditableEntity
{
    public Guid UserId { get; set; }
    public Guid ClinicId { get; set; }

    public Clinic Clinic { get; set; } = null!;
}
