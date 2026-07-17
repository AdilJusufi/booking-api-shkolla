using Booking.Domain.Common;

namespace Booking.Domain.Entities;

/// <summary>Dega e klinikës — lokacioni fizik ku punojnë doktorët. V1 fokus Prishtina, por struktura mbështet çdo qytet.</summary>
public class ClinicBranch : AuditableEntity
{
    public Guid ClinicId { get; set; }
    public string Name { get; set; } = null!;
    public string Address { get; set; } = null!;
    public string City { get; set; } = null!;
    public string? Municipality { get; set; }
    public decimal? Latitude { get; set; }
    public decimal? Longitude { get; set; }
    public string? PhoneNumber { get; set; }
    public bool IsActive { get; set; } = true;

    public Clinic Clinic { get; set; } = null!;
    public ICollection<DoctorClinicBranch> DoctorClinicBranches { get; set; } = new List<DoctorClinicBranch>();
}
