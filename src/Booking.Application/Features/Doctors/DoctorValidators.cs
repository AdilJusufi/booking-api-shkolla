using FluentValidation;

namespace Booking.Application.Features.Doctors;

/// <summary>
/// Vetëm gjatësia këtu — që URL-ja është në cloud-in tonë dhe në dosjen e këtij mjeku
/// kontrollohet te DoctorPhotoService, sepse kërkon konfigurimin e Cloudinary dhe doctorId-në.
/// </summary>
public sealed class SetDoctorPhotoRequestValidator : AbstractValidator<SetDoctorPhotoRequest>
{
    public SetDoctorPhotoRequestValidator()
    {
        RuleFor(x => x.PhotoUrl).MaximumLength(500);
    }
}
