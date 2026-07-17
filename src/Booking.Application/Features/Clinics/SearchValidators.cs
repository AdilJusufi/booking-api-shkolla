using Booking.Application.Features.Doctors;
using FluentValidation;

namespace Booking.Application.Features.Clinics;

public sealed class ClinicSearchRequestValidator : AbstractValidator<ClinicSearchRequest>
{
    public ClinicSearchRequestValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.SearchTerm).MaximumLength(200);
        RuleFor(x => x.City).MaximumLength(100);
        RuleFor(x => x.Municipality).MaximumLength(100);
        RuleFor(x => x.SortBy)
            .Must(sortBy => sortBy is null or "name" or "name_desc")
            .WithMessage("SortBy mbështet vetëm: name, name_desc.");
    }
}

public sealed class DoctorSearchRequestValidator : AbstractValidator<DoctorSearchRequest>
{
    public DoctorSearchRequestValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.SearchTerm).MaximumLength(200);
    }
}
