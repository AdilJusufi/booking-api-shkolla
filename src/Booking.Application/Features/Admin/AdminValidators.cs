using Booking.Application.Features.Auth;
using FluentValidation;

namespace Booking.Application.Features.Admin;

public sealed class CreateClinicRequestValidator : AbstractValidator<CreateClinicRequest>
{
    public CreateClinicRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.PhoneNumber).MaximumLength(30);
        RuleFor(x => x.Email).EmailAddress().MaximumLength(256).When(x => !string.IsNullOrEmpty(x.Email));
        RuleFor(x => x.Website).MaximumLength(300);
    }
}

public sealed class UpdateClinicRequestValidator : AbstractValidator<UpdateClinicRequest>
{
    public UpdateClinicRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(2000);
        RuleFor(x => x.PhoneNumber).MaximumLength(30);
        RuleFor(x => x.Email).EmailAddress().MaximumLength(256).When(x => !string.IsNullOrEmpty(x.Email));
        RuleFor(x => x.Website).MaximumLength(300);
    }
}

public sealed class CreateBranchRequestValidator : AbstractValidator<CreateBranchRequest>
{
    public CreateBranchRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Address).NotEmpty().MaximumLength(300);
        RuleFor(x => x.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Municipality).MaximumLength(100);
        RuleFor(x => x.PhoneNumber).MaximumLength(30);
        RuleFor(x => x.Latitude).InclusiveBetween(-90, 90).When(x => x.Latitude.HasValue);
        RuleFor(x => x.Longitude).InclusiveBetween(-180, 180).When(x => x.Longitude.HasValue);
    }
}

public sealed class CreateMedicalServiceRequestValidator : AbstractValidator<CreateMedicalServiceRequest>
{
    public CreateMedicalServiceRequestValidator()
    {
        RuleFor(x => x.SpecialtyId).NotEmpty();
        RuleFor(x => x.Name).NotEmpty().MaximumLength(200);
        RuleFor(x => x.Description).MaximumLength(1000);
        RuleFor(x => x.DurationMinutes).InclusiveBetween(5, 480);
        RuleFor(x => x.Price).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Currency).NotEmpty().Length(3);
    }
}

public sealed class CreateDoctorRequestValidator : AbstractValidator<CreateDoctorRequest>
{
    public CreateDoctorRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(x => x.PhoneNumber).NotEmpty().MaximumLength(30);
        RuleFor(x => x.InitialPassword).ValidPassword();
        RuleFor(x => x.LicenseNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.Biography).MaximumLength(2000);
        RuleFor(x => x.YearsOfExperience).InclusiveBetween(0, 70);
        RuleFor(x => x.SpecialtyIds).NotEmpty();
        RuleFor(x => x.BranchIds).NotEmpty();
    }
}

public sealed class AssignClinicAdminRequestValidator : AbstractValidator<AssignClinicAdminRequest>
{
    public AssignClinicAdminRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}

public sealed class CreateSpecialtyRequestValidator : AbstractValidator<CreateSpecialtyRequest>
{
    public CreateSpecialtyRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(1000);
    }
}

public sealed class UpdateSpecialtyRequestValidator : AbstractValidator<UpdateSpecialtyRequest>
{
    public UpdateSpecialtyRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Description).MaximumLength(1000);
    }
}

public sealed class AdminCreateAppointmentRequestValidator : AbstractValidator<AdminCreateAppointmentRequest>
{
    public AdminCreateAppointmentRequestValidator()
    {
        RuleFor(x => x.PatientEmail).NotEmpty().EmailAddress();
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.ClinicBranchId).NotEmpty();
        RuleFor(x => x.MedicalServiceId).NotEmpty();
        RuleFor(x => x.PatientNote).MaximumLength(1000);
        RuleFor(x => x.InternalNote).MaximumLength(1000);
    }
}

public sealed class AdminUpdateAppointmentRequestValidator : AbstractValidator<AdminUpdateAppointmentRequest>
{
    public AdminUpdateAppointmentRequestValidator()
    {
        RuleFor(x => x.InternalNote).MaximumLength(1000);
        RuleFor(x => x.Status).IsInEnum().When(x => x.Status.HasValue);
        RuleFor(x => x)
            .Must(x => x.InternalNote is not null || x.Status is not null)
            .WithMessage("Duhet të jepet së paku një fushë për ndryshim.");
    }
}

public sealed class AdminCancelAppointmentRequestValidator : AbstractValidator<AdminCancelAppointmentRequest>
{
    public AdminCancelAppointmentRequestValidator()
    {
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}

public sealed class AuditLogQueryValidator : AbstractValidator<AuditLogQuery>
{
    public AuditLogQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.EntityName).MaximumLength(100);
    }
}
