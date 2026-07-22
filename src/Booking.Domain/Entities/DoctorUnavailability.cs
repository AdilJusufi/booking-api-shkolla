using Booking.Domain.Common;
using Booking.Domain.ValueObjects;

namespace Booking.Domain.Entities;

/// <summary>Periudhë kur doktori NUK pranon rezervime (pushim, pauzë, festë, bllokim administrativ). Datat në UTC.</summary>
public class DoctorUnavailability : AuditableEntity
{
    public Guid DoctorId { get; set; }

    /// <summary>Null = bllokimi vlen për të gjitha degët e doktorit.</summary>
    public Guid? ClinicBranchId { get; set; }

    public DateTime StartDateTime { get; set; }
    public DateTime EndDateTime { get; set; }
    public string? Reason { get; set; }

    public Doctor Doctor { get; set; } = null!;

    public DateTimeRange ToRange() => new(StartDateTime, EndDateTime);

    public bool AppliesToBranch(Guid branchId) => ClinicBranchId is null || ClinicBranchId == branchId;
}
