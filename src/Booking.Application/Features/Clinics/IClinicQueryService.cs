using Booking.Application.Common.Models;
using Booking.Application.Features.Doctors;

namespace Booking.Application.Features.Clinics;

/// <summary>Kërkimi publik i klinikave — kthen vetëm klinika të aprovuara dhe aktive.</summary>
public interface IClinicQueryService
{
    Task<PagedResult<ClinicDto>> SearchAsync(ClinicSearchRequest request, CancellationToken cancellationToken = default);

    Task<ClinicDetailsDto> GetByIdAsync(Guid clinicId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ClinicBranchDto>> GetBranchesAsync(Guid clinicId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DoctorDto>> GetDoctorsAsync(Guid clinicId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<MedicalServiceDto>> GetServicesAsync(Guid clinicId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<SpecialtyDto>> GetSpecialtiesAsync(CancellationToken cancellationToken = default);
}
