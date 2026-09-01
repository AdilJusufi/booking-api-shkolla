using Booking.Application.Features.Doctors;

namespace Booking.Application.Features.Schedules;

/// <summary>
/// Menaxhimi i orarit dhe bllokimeve të doktorit. Përdoret nga doktori vetë
/// (doctorId zgjidhet nga useri i kyçur) dhe nga ClinicAdmin/SuperAdmin (Faza 6).
/// </summary>
public interface IScheduleService
{
    /// <summary>Gjen Doctor.Id për userin e kyçur me rol Doctor.</summary>
    Task<Guid> GetDoctorIdForUserAsync(Guid userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Degët e caktuara të doktorit (DoctorClinicBranch) — E PAVARUR nga oraret ekzistuese.
    /// I domosdoshëm për formularin "shto orar të parë": nëse do të nxirrej nga
    /// GetSchedulesAsync, një doktor pa asnjë orar ende (rasti pikërisht kur i duhet ky
    /// formular) do të shihte gjithmonë "asnjë degë" edhe pse ka degë reale të caktuara.
    /// </summary>
    Task<IReadOnlyList<DoctorBranchDto>> GetDoctorBranchesAsync(Guid doctorId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<WorkingScheduleDto>> GetSchedulesAsync(Guid doctorId, CancellationToken cancellationToken = default);

    Task<WorkingScheduleDto> AddScheduleAsync(
        Guid doctorId, CreateWorkingScheduleRequest request, CancellationToken cancellationToken = default);

    Task DeactivateScheduleAsync(Guid doctorId, Guid scheduleId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<UnavailabilityDto>> GetUnavailabilitiesAsync(
        Guid doctorId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);

    Task<UnavailabilityDto> AddUnavailabilityAsync(
        Guid doctorId, CreateUnavailabilityRequest request, CancellationToken cancellationToken = default);

    Task DeleteUnavailabilityAsync(Guid doctorId, Guid unavailabilityId, CancellationToken cancellationToken = default);
}
