using System.Text.Json.Serialization;
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

/// <summary>Query params për GET /api/doctors/{doctorId}/available-days.</summary>
public sealed record AvailableDaysQuery
{
    public required Guid BranchId { get; init; }
    public required Guid ServiceId { get; init; }

    /// <summary>Dita e parë (lokale, përfshirë), format: yyyy-MM-dd.</summary>
    public required DateOnly From { get; init; }

    /// <summary>Dita e fundit (lokale, përfshirë), format: yyyy-MM-dd.</summary>
    public required DateOnly To { get; init; }
}

/// <summary>Gjendja e një dite në kalendarin e rezervimit. Serializohet si string ("Closed"/"Full"/"Available").</summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum DayAvailability
{
    /// <summary>Doktori nuk ka orar pune atë ditë (p.sh. e diel).</summary>
    Closed,

    /// <summary>Ka orar, por asnjë slot i lirë (i zënë plotësisht, bllokim, ose oraret kanë kaluar).</summary>
    Full,

    /// <summary>Të paktën një slot i lirë.</summary>
    Available
}

public sealed record AvailableDayDto
{
    public required DateOnly Date { get; init; }
    public required DayAvailability Status { get; init; }
}

public sealed class AvailableDaysQueryValidator : AbstractValidator<AvailableDaysQuery>
{
    public const int MaxRangeDays = 62;

    public AvailableDaysQueryValidator()
    {
        RuleFor(x => x.BranchId).NotEmpty();
        RuleFor(x => x.ServiceId).NotEmpty();
        RuleFor(x => x.To)
            .GreaterThanOrEqualTo(x => x.From)
            .WithMessage("Data 'To' duhet të jetë pas datës 'From'.");
        RuleFor(x => x)
            .Must(x => x.To.DayNumber - x.From.DayNumber < MaxRangeDays)
            .WithMessage($"Intervali mund të jetë maksimum {MaxRangeDays} ditë.");
        RuleFor(x => x.To)
            .Must(date => date <= DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(180))
            .WithMessage("Ditët mund të kërkohen maksimum 180 ditë përpara.");
    }
}
