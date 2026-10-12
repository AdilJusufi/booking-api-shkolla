using Booking.Domain.Common;

namespace Booking.Domain.Entities;

public class Doctor : AuditableEntity
{
    public Guid UserId { get; set; }
    public string LicenseNumber { get; set; } = null!;
    public string? Biography { get; set; }

    /// <summary>URL-ja e fotos te Cloudinary — gjithmonë brenda dosjes doctors/{Id}/photo (shih DoctorPhotoService).</summary>
    public string? PhotoUrl { get; set; }
    public int YearsOfExperience { get; set; }
    public bool IsVerified { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<DoctorSpecialty> DoctorSpecialties { get; set; } = new List<DoctorSpecialty>();
    public ICollection<DoctorClinicBranch> DoctorClinicBranches { get; set; } = new List<DoctorClinicBranch>();
    public ICollection<DoctorService> DoctorServices { get; set; } = new List<DoctorService>();
    public ICollection<DoctorWorkingSchedule> WorkingSchedules { get; set; } = new List<DoctorWorkingSchedule>();
}
