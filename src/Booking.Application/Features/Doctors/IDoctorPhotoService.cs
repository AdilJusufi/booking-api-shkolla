using Booking.Application.Common.Models;

namespace Booking.Application.Features.Doctors;

/// <summary>
/// Fotoja e mjekut. E ndryshojnë vetëm dy palë: vetë mjeku, ose admini i një klinike ku
/// mjeku punon (SuperAdmin-i gjithashtu). Kontrolli është mbi pronësinë, jo vetëm mbi rolin.
/// </summary>
public interface IDoctorPhotoService
{
    Task<DoctorSelfProfileDto> GetOwnProfileAsync(CancellationToken cancellationToken = default);

    /// <summary>Nënshkrim për ngarkim direkt te Cloudinary, në dosjen fikse doctors/{doctorId}/photo.</summary>
    Task<CloudinarySignatureDto> GenerateUploadSignatureAsync(Guid doctorId, CancellationToken cancellationToken = default);

    Task<DoctorPhotoDto> SetPhotoAsync(Guid doctorId, SetDoctorPhotoRequest request, CancellationToken cancellationToken = default);
}
