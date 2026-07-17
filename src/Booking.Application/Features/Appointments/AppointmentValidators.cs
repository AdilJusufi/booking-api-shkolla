using FluentValidation;

namespace Booking.Application.Features.Appointments;

public sealed class CreateAppointmentRequestValidator : AbstractValidator<CreateAppointmentRequest>
{
    public CreateAppointmentRequestValidator()
    {
        RuleFor(x => x.DoctorId).NotEmpty();
        RuleFor(x => x.ClinicBranchId).NotEmpty();
        RuleFor(x => x.MedicalServiceId).NotEmpty();
        RuleFor(x => x.PatientNote).MaximumLength(1000);

        // Kontrolli i saktë "jo në të kaluarën" bëhet në service me orën e Prishtinës;
        // këtu vetëm një prag i gjerë kundër vlerave absurde.
        RuleFor(x => x.StartDateTime)
            .Must(start => start > DateTime.UtcNow.AddDays(-2))
            .WithMessage("Data e terminit është në të kaluarën.")
            .Must(start => start < DateTime.UtcNow.AddDays(181))
            .WithMessage("Terminet mund të rezervohen maksimum 180 ditë përpara.");
    }
}

public sealed class CancelAppointmentRequestValidator : AbstractValidator<CancelAppointmentRequest>
{
    public CancelAppointmentRequestValidator()
    {
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}

public sealed class RescheduleAppointmentRequestValidator : AbstractValidator<RescheduleAppointmentRequest>
{
    public RescheduleAppointmentRequestValidator()
    {
        RuleFor(x => x.NewStartDateTime)
            .Must(start => start > DateTime.UtcNow.AddDays(-2))
            .WithMessage("Data e re është në të kaluarën.")
            .Must(start => start < DateTime.UtcNow.AddDays(181))
            .WithMessage("Terminet mund të riplanifikohen maksimum 180 ditë përpara.");
    }
}

public sealed class MyAppointmentsQueryValidator : AbstractValidator<MyAppointmentsQuery>
{
    public MyAppointmentsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Status).IsInEnum().When(x => x.Status.HasValue);
    }
}

public sealed class DoctorAppointmentsQueryValidator : AbstractValidator<DoctorAppointmentsQuery>
{
    public DoctorAppointmentsQueryValidator()
    {
        RuleFor(x => x.Page).GreaterThanOrEqualTo(1);
        RuleFor(x => x.PageSize).InclusiveBetween(1, 100);
        RuleFor(x => x.Status).IsInEnum().When(x => x.Status.HasValue);
    }
}

public sealed class UpdateInternalNoteRequestValidator : AbstractValidator<UpdateInternalNoteRequest>
{
    public UpdateInternalNoteRequestValidator()
    {
        RuleFor(x => x.InternalNote).NotEmpty().MaximumLength(1000);
    }
}
