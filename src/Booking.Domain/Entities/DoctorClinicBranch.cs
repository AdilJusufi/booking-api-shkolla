namespace Booking.Domain.Entities;

/// <summary>Dega/klinika ku punon doktori — një doktor mund të punojë në disa degë. Çelës i përbërë (DoctorId, ClinicBranchId).</summary>
public class DoctorClinicBranch
{
    public Guid DoctorId { get; set; }
    public Guid ClinicBranchId { get; set; }
    public bool IsActive { get; set; } = true;

    public Doctor Doctor { get; set; } = null!;
    public ClinicBranch ClinicBranch { get; set; } = null!;
}
