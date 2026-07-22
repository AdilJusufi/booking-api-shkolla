using Booking.Domain.Common;
using Booking.Domain.Enums;

namespace Booking.Domain.Entities;

/// <summary>Person i varur (p.sh. fëmijë) për të cilin pacienti rezervon termine.</summary>
public class Dependent : AuditableEntity
{
    public Guid PatientProfileId { get; set; }
    public string FirstName { get; set; } = null!;
    public string LastName { get; set; } = null!;
    public DateOnly DateOfBirth { get; set; }
    public Gender Gender { get; set; }
    public DependentRelationship Relationship { get; set; }
    public bool IsActive { get; set; } = true;

    public PatientProfile PatientProfile { get; set; } = null!;
}
