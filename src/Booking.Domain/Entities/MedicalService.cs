using Booking.Domain.Common;

namespace Booking.Domain.Entities;

/// <summary>Shërbim mjekësor i ofruar nga klinika (p.sh. "Pastrim i dhëmbëve", 30 min, 25 EUR).</summary>
public class MedicalService : AuditableEntity
{
    public Guid ClinicId { get; set; }
    public Guid SpecialtyId { get; set; }
    public string Name { get; set; } = null!;
    public string? Description { get; set; }
    public int DurationMinutes { get; set; }
    public decimal Price { get; set; }
    public string Currency { get; set; } = "EUR";
    public bool IsActive { get; set; } = true;

    public Clinic Clinic { get; set; } = null!;
    public Specialty Specialty { get; set; } = null!;
    public ICollection<DoctorService> DoctorServices { get; set; } = new List<DoctorService>();
}
