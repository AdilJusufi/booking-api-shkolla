namespace Booking.Application.Features.Patients;

/// <summary>Profili i pacientit të kyçur dhe dependentët e tij — gjithmonë të skopuar në userId nga JWT.</summary>
public interface IPatientService
{
    Task<PatientProfileDto> GetMeAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<PatientProfileDto> UpdateMeAsync(Guid userId, UpdatePatientProfileRequest request, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<DependentDto>> GetDependentsAsync(Guid userId, CancellationToken cancellationToken = default);

    Task<DependentDto> AddDependentAsync(Guid userId, CreateDependentRequest request, CancellationToken cancellationToken = default);

    Task<DependentDto> UpdateDependentAsync(
        Guid userId, Guid dependentId, UpdateDependentRequest request, CancellationToken cancellationToken = default);

    /// <summary>Soft delete (IsActive = false) — dependenti mund të ketë historik terminesh.</summary>
    Task DeleteDependentAsync(Guid userId, Guid dependentId, CancellationToken cancellationToken = default);
}
