using Booking.Domain.Common;

namespace Booking.Domain.Entities;

public class Clinic : AuditableEntity
{
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public string? PhoneNumber { get; set; }
    public string? Email { get; set; }
    public string? Website { get; set; }

    /// <summary>Klinika e re duhet aprovuar nga SuperAdmin para se të shfaqet publikisht.</summary>
    public bool IsApproved { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<ClinicBranch> Branches { get; set; } = new List<ClinicBranch>();
    public ICollection<MedicalService> Services { get; set; } = new List<MedicalService>();
}
