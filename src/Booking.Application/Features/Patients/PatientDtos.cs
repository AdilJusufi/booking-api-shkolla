using Booking.Domain.Enums;
using FluentValidation;

namespace Booking.Application.Features.Patients;

public sealed record PatientProfileDto
{
    public required Guid UserId { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string Email { get; init; }
    public string? PhoneNumber { get; init; }
    public required DateOnly DateOfBirth { get; init; }
    public required Gender Gender { get; init; }
    public string? PersonalNumber { get; init; }
    public string? Address { get; init; }
    public string? City { get; init; }
}

public sealed record UpdatePatientProfileRequest
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string PhoneNumber { get; init; }
    public required DateOnly DateOfBirth { get; init; }
    public required Gender Gender { get; init; }
    public string? PersonalNumber { get; init; }
    public string? Address { get; init; }
    public string? City { get; init; }
}

public sealed record DependentDto
{
    public required Guid Id { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required DateOnly DateOfBirth { get; init; }
    public required Gender Gender { get; init; }
    public required DependentRelationship Relationship { get; init; }
    public required bool IsActive { get; init; }
}

public sealed record CreateDependentRequest
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required DateOnly DateOfBirth { get; init; }
    public required Gender Gender { get; init; }
    public required DependentRelationship Relationship { get; init; }
}

public sealed record UpdateDependentRequest
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required DateOnly DateOfBirth { get; init; }
    public required Gender Gender { get; init; }
    public required DependentRelationship Relationship { get; init; }
}

public sealed class UpdatePatientProfileRequestValidator : AbstractValidator<UpdatePatientProfileRequest>
{
    public UpdatePatientProfileRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PhoneNumber).NotEmpty().Matches(@"^\+?[0-9][0-9 \-]{5,19}$");
        RuleFor(x => x.DateOfBirth)
            .Must(dob => dob < DateOnly.FromDateTime(DateTime.UtcNow))
            .WithMessage("Data e lindjes duhet të jetë në të kaluarën.");
        RuleFor(x => x.Gender).IsInEnum();
        RuleFor(x => x.PersonalNumber).MaximumLength(20);
        RuleFor(x => x.Address).MaximumLength(300);
        RuleFor(x => x.City).MaximumLength(100);
    }
}

public sealed class CreateDependentRequestValidator : AbstractValidator<CreateDependentRequest>
{
    public CreateDependentRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.DateOfBirth)
            .Must(dob => dob < DateOnly.FromDateTime(DateTime.UtcNow))
            .WithMessage("Data e lindjes duhet të jetë në të kaluarën.");
        RuleFor(x => x.Gender).IsInEnum();
        RuleFor(x => x.Relationship).IsInEnum();
    }
}

public sealed class UpdateDependentRequestValidator : AbstractValidator<UpdateDependentRequest>
{
    public UpdateDependentRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.DateOfBirth)
            .Must(dob => dob < DateOnly.FromDateTime(DateTime.UtcNow))
            .WithMessage("Data e lindjes duhet të jetë në të kaluarën.");
        RuleFor(x => x.Gender).IsInEnum();
        RuleFor(x => x.Relationship).IsInEnum();
    }
}
