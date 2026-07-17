using Booking.Application.Common.Models;

namespace Booking.Application.Features.Doctors;

/// <summary>Kërkimi publik i doktorëve — kthen vetëm doktorë aktivë e të verifikuar.</summary>
public interface IDoctorQueryService
{
    Task<PagedResult<DoctorDto>> SearchAsync(DoctorSearchRequest request, CancellationToken cancellationToken = default);

    Task<DoctorDetailsDto> GetByIdAsync(Guid doctorId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DoctorServiceDto>> GetServicesAsync(Guid doctorId, CancellationToken cancellationToken = default);
}
