using Booking.Domain.Common;

namespace Booking.Domain.Entities;

/// <summary>Specializimi mjekësor (Dentist, Pediatër, Oftalmolog, ...). Menaxhohet nga SuperAdmin.</summary>
public class Specialty : AuditableEntity
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;
}
