using FluentValidation;

namespace Booking.Application.Features.Schedules;

public sealed class CreateWorkingScheduleRequestValidator : AbstractValidator<CreateWorkingScheduleRequest>
{
    public CreateWorkingScheduleRequestValidator()
    {
        RuleFor(x => x.ClinicBranchId).NotEmpty();
        RuleFor(x => x.DayOfWeek).IsInEnum();
        RuleFor(x => x.EndTime)
            .Must((request, endTime) => endTime > request.StartTime)
            .WithMessage("Ora e mbarimit duhet të jetë pas orës së fillimit.");
        RuleFor(x => x.SlotDurationMinutes).InclusiveBetween(5, 240);
        RuleFor(x => x.ValidUntil)
            .Must((request, validUntil) =>
                validUntil is null || request.ValidFrom is null || validUntil >= request.ValidFrom)
            .WithMessage("ValidUntil duhet të jetë pas ose e barabartë me ValidFrom.");
    }
}

public sealed class CreateUnavailabilityRequestValidator : AbstractValidator<CreateUnavailabilityRequest>
{
    public CreateUnavailabilityRequestValidator()
    {
        RuleFor(x => x.EndDateTime)
            .Must((request, endDateTime) => endDateTime > request.StartDateTime)
            .WithMessage("Mbarimi duhet të jetë pas fillimit.");
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}
