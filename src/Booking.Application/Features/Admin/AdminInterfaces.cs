using Booking.Application.Common.Models;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Clinics;
using Booking.Application.Features.Schedules;

namespace Booking.Application.Features.Admin;

/// <summary>
/// Administrimi i klinikës. Çdo metodë verifikon që useri i kyçur menaxhon klinikën
/// përkatëse (tenant isolation) — SuperAdmin ka qasje kudo.
/// </summary>
public interface IClinicAdminService
{
    Task<IReadOnlyList<AdminClinicDto>> GetMyClinicsAsync(CancellationToken cancellationToken = default);

    /// <summary>Vetëm SuperAdmin — klinika krijohet e paaprovuar (IsApproved = false).</summary>
    Task<AdminClinicDto> CreateClinicAsync(CreateClinicRequest request, CancellationToken cancellationToken = default);

    Task<AdminClinicDto> UpdateClinicAsync(Guid clinicId, UpdateClinicRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gjeneron një signature Cloudinary për signed upload direkt nga frontend-i te
    /// Cloudinary — API secret-i nuk del kurrë nga backend-i.
    /// </summary>
    Task<CloudinarySignatureDto> GenerateUploadSignatureAsync(Guid clinicId, CancellationToken cancellationToken = default);

    Task<ClinicBranchDto> AddBranchAsync(Guid clinicId, CreateBranchRequest request, CancellationToken cancellationToken = default);

    Task<MedicalServiceDto> AddServiceAsync(Guid clinicId, CreateMedicalServiceRequest request, CancellationToken cancellationToken = default);

    /// <summary>Krijon user me rol Doctor + profil doktori + lidhjet me specializime/degë/shërbime.</summary>
    Task<AdminDoctorDetailDto> CreateDoctorAsync(Guid clinicId, CreateDoctorRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// Të gjithë doktorët e klinikës — përfshirë joaktivët, ndryshe nga GET /api/clinics/{id}/doctors
    /// (publik), që i fsheh. Admini duhet t'i shohë për t'i riaktivizuar.
    /// </summary>
    Task<IReadOnlyList<AdminDoctorDetailDto>> GetDoctorsAsync(Guid clinicId, CancellationToken cancellationToken = default);

    Task<AdminDoctorDetailDto> UpdateDoctorAsync(
        Guid doctorId, UpdateDoctorRequest request, CancellationToken cancellationToken = default);

    Task<AdminDoctorDetailDto> UpdateDoctorBranchesAsync(
        Guid doctorId, UpdateDoctorBranchesRequest request, CancellationToken cancellationToken = default);

    Task<AdminDoctorDetailDto> UpdateDoctorServicesAsync(
        Guid doctorId, UpdateDoctorServicesRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// 409 "doctor-has-future-appointments" nëse ka termine të ardhshme aktive dhe
    /// request.CancelFutureAppointments është false — shih SetDoctorActiveRequest.
    /// </summary>
    Task<AdminDoctorDetailDto> DeactivateDoctorAsync(
        Guid doctorId, SetDoctorActiveRequest request, CancellationToken cancellationToken = default);

    Task<AdminDoctorDetailDto> ActivateDoctorAsync(Guid doctorId, CancellationToken cancellationToken = default);

    Task<WorkingScheduleDto> AddDoctorScheduleAsync(
        Guid doctorId, CreateWorkingScheduleRequest request, CancellationToken cancellationToken = default);

    Task<UnavailabilityDto> AddDoctorUnavailabilityAsync(
        Guid doctorId, CreateUnavailabilityRequest request, CancellationToken cancellationToken = default);

    Task<ClinicReportDto> GetReportAsync(Guid clinicId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
}

/// <summary>Veprimet vetëm për SuperAdmin.</summary>
public interface ISuperAdminService
{
    Task<AdminClinicDto> ApproveClinicAsync(Guid clinicId, CancellationToken cancellationToken = default);

    Task<AdminClinicDto> SetClinicActiveAsync(Guid clinicId, bool isActive, CancellationToken cancellationToken = default);

    Task AssignClinicAdminAsync(Guid clinicId, AssignClinicAdminRequest request, CancellationToken cancellationToken = default);

    Task<SpecialtyDto> CreateSpecialtyAsync(CreateSpecialtyRequest request, CancellationToken cancellationToken = default);

    Task<SpecialtyDto> UpdateSpecialtyAsync(Guid specialtyId, UpdateSpecialtyRequest request, CancellationToken cancellationToken = default);

    /// <summary>Soft delete: e vendos IsActive=false, s'e fshin fizikisht (ruan FK-të drejt doktorëve/shërbimeve).</summary>
    Task DeleteSpecialtyAsync(Guid specialtyId, CancellationToken cancellationToken = default);

    Task<PagedResult<AdminUserDto>> GetUsersAsync(AdminUsersQuery query, CancellationToken cancellationToken = default);

    /// <summary>Çaktivizimi revokon edhe të gjitha refresh token-at e userit.</summary>
    Task SetUserActiveAsync(Guid userId, bool isActive, CancellationToken cancellationToken = default);

    Task<PagedResult<AuditLogDto>> GetAuditLogsAsync(AuditLogQuery query, CancellationToken cancellationToken = default);
}

/// <summary>Menaxhimi i termineve nga ClinicAdmin — pa kufizimin e orëve të anulimit, por gjithmonë me audit log.</summary>
public interface IAdminAppointmentService
{
    /// <summary>
    /// Lista e termineve të klinikave që i menaxhon useri i kyçur (SuperAdmin i sheh të gjitha).
    /// Rreshtat vijnë të denormalizuar — pa N+1 nga frontend-i.
    /// </summary>
    Task<PagedResult<AdminAppointmentListItemDto>> GetAsync(
        AdminAppointmentsQuery query, CancellationToken cancellationToken = default);

    Task<DoctorAppointmentDto> CreateForPatientAsync(
        AdminCreateAppointmentRequest request, CancellationToken cancellationToken = default);

    Task<DoctorAppointmentDto> UpdateAsync(
        Guid appointmentId, AdminUpdateAppointmentRequest request, CancellationToken cancellationToken = default);

    Task<DoctorAppointmentDto> CancelAsync(
        Guid appointmentId, AdminCancelAppointmentRequest request, CancellationToken cancellationToken = default);

    Task<DoctorAppointmentDto> RescheduleAsync(
        Guid appointmentId, AdminRescheduleAppointmentRequest request, CancellationToken cancellationToken = default);
}

/// <summary>
/// Kërkimi dhe krijimi i pacientëve nga recepsioni — baza e rezervimit me telefon.
/// Të dyja metodat auditohen: ekspozojnë të dhëna pacientësh te stafi i klinikës.
/// </summary>
public interface IAdminPatientService
{
    /// <summary>
    /// Kërkon pacientë për të rezervuar në emër të tyre. Shtrirja varet nga forma e
    /// query-t (email/telefon i plotë = global me detaje të reduktuara; emër = vetëm
    /// pacientët e klinikave të mia). Kurrë nuk kthen PersonalNumber.
    /// </summary>
    Task<PagedResult<AdminPatientSearchResultDto>> SearchAsync(
        AdminPatientSearchQuery query, CancellationToken cancellationToken = default);

    /// <summary>
    /// Krijon pacient për dikë që s'ka llogari. Llogaria krijohet pa password —
    /// pacienti e merr në dorëzim vetë përmes rivendosjes së fjalëkalimit.
    /// Hedh 409 nëse email-i ose telefoni ekziston tashmë.
    /// </summary>
    Task<AdminPatientDto> CreateAsync(
        AdminCreatePatientRequest request, CancellationToken cancellationToken = default);
}
