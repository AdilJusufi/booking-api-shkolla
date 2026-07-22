namespace Booking.Domain.Entities;

/// <summary>Many-to-many: doktori mund të ketë disa specializime. Çelës i përbërë (DoctorId, SpecialtyId).</summary>
public class DoctorSpecialty
{
    public Guid DoctorId { get; set; }
    public Guid SpecialtyId { get; set; }

    public Doctor Doctor { get; set; } = null!;
    public Specialty Specialty { get; set; } = null!;
}
