using Booking.Domain.Common;
using Booking.Domain.Enums;

namespace Booking.Domain.Entities;

/// <summary>Profili i pacientit — zgjeron User-in (Identity) me të dhëna pacienti.</summary>
public class PatientProfile : AuditableEntity
{
    public Guid UserId { get; set; }
    public DateOnly DateOfBirth { get; set; }
    public Gender Gender { get; set; }

    /// <summary>Numri personal — opsional, i ndjeshëm; kurrë nuk logohet dhe nuk kthehet në liste/search.</summary>
    public string? PersonalNumber { get; set; }

    public string? Address { get; set; }
    public string? City { get; set; }

    public ICollection<Dependent> Dependents { get; set; } = new List<Dependent>();
    public ICollection<Appointment> Appointments { get; set; } = new List<Appointment>();
}
