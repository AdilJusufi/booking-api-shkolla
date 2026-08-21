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
        RuleFor(x => x.LogoUrl).MaximumLength(500);
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
        // Duhet saktësisht njëri identifikues — pa këtë, një kërkesë pa asnjë të dhënë
        // pacienti do të kalonte validimin dhe do të dështonte më vonë si "nuk u gjet".
        RuleFor(x => x)
            .Must(x => x.PatientProfileId.HasValue ^ !string.IsNullOrWhiteSpace(x.PatientEmail))
            .WithMessage("Jep ose patientProfileId ose patientEmail — jo të dyja, jo asnjërin.");
        RuleFor(x => x.PatientEmail).EmailAddress().When(x => !string.IsNullOrWhiteSpace(x.PatientEmail));
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

public sealed class AdminAppointmentsQueryValidator : AbstractValidator<AdminAppointmentsQuery>
{
    public AdminAppointmentsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Status).IsInEnum().When(x => x.Status.HasValue);
        RuleFor(x => x.Search).MaximumLength(256);
        RuleFor(x => x.To)
            .GreaterThanOrEqualTo(x => x.From!.Value)
            .When(x => x.From.HasValue && x.To.HasValue)
            .WithMessage("Data 'to' nuk mund të jetë para 'from'.");
    }
}

public sealed class AdminUsersQueryValidator : AbstractValidator<AdminUsersQuery>
{
    public AdminUsersQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Role).MaximumLength(100);
        RuleFor(x => x.Search).MaximumLength(256);
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

public sealed class AdminPatientSearchQueryValidator : AbstractValidator<AdminPatientSearchQuery>
{
    public AdminPatientSearchQueryValidator()
    {
        // Minimumi 3 karaktere: bllokon enumerimin e bazës me një shkronjë të vetme.
        RuleFor(x => x.Query)
            .NotEmpty()
            .MinimumLength(3).WithMessage("Kërkimi kërkon së paku 3 karaktere.")
            .MaximumLength(256);
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 50);
    }
}

public sealed class AdminCreatePatientRequestValidator : AbstractValidator<AdminCreatePatientRequest>
{
    public AdminCreatePatientRequestValidator()
    {
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PhoneNumber)
            .NotEmpty()
            .Matches(@"^\+?[0-9][0-9 \-]{5,19}$")
            .WithMessage("Numri i telefonit duhet të përmbajë 6–20 shifra, opsionalisht me prefiks +.");
        // Email-i mbetet opsional — thirrësi mund të mos ketë fare.
        RuleFor(x => x.Email).EmailAddress().MaximumLength(256).When(x => !string.IsNullOrWhiteSpace(x.Email));
        RuleFor(x => x.DateOfBirth)
            .Must(dob => dob < DateOnly.FromDateTime(DateTime.UtcNow))
            .WithMessage("Data e lindjes duhet të jetë në të kaluarën.");
        RuleFor(x => x.Gender).IsInEnum();
        RuleFor(x => x.Address).MaximumLength(300);
        RuleFor(x => x.City).MaximumLength(100);
    }
}
