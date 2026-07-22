using FluentValidation;

namespace Booking.Application.Features.Availability;

/// <summary>Query params për GET /api/doctors/{doctorId}/available-slots.</summary>
public sealed record AvailableSlotsQuery
{
    public required Guid BranchId { get; init; }
    public required Guid ServiceId { get; init; }

    /// <summary>Data lokale (Europe/Belgrade), format: yyyy-MM-dd.</summary>
    public required DateOnly Date { get; init; }
}

/// <summary>Slot i lirë. Datat janë në orën lokale të Prishtinës (Europe/Belgrade).</summary>
public sealed record AvailableSlotDto
{
    public required DateTime StartDateTime { get; init; }
    public required DateTime EndDateTime { get; init; }
    public required bool IsAvailable { get; init; }
    public required Guid DoctorId { get; init; }
    public required Guid BranchId { get; init; }
    public required Guid ServiceId { get; init; }
}

public sealed class AvailableSlotsQueryValidator : AbstractValidator<AvailableSlotsQuery>
{
    public AvailableSlotsQueryValidator()
    {
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x.ServiceId).NotEmpty();
        RuleFor(x => x.Date)
            .Must(date => date >= DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(-1))
            .WithMessage("Data nuk mund të jetë në të kaluarën.")
            .Must(date => date <= DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(180))
            .WithMessage("Slotet mund të kërkohen maksimum 180 ditë përpara.");
    }
}
