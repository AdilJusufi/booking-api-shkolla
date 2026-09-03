using Booking.Application.Common.Models;
using Booking.Domain.Enums;

namespace Booking.Application.Features.Admin;

// ---------- Klinika ----------

public sealed record CreateClinicRequest
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; init; }
    public string? Website { get; init; }
}

public sealed record UpdateClinicRequest
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; init; }
    public string? Website { get; init; }
    public string? LogoUrl { get; init; }
}

/// <summary>Pamja administrative — përfshin edhe IsApproved/IsActive që publiku s'i sheh.</summary>
public sealed record AdminClinicDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public string? PhoneNumber { get; init; }
    public string? Email { get; init; }
    public string? Website { get; init; }
    public string? LogoUrl { get; init; }
    public required bool IsApproved { get; init; }
    public required bool IsActive { get; init; }
    public required DateTime CreatedAt { get; init; }

    /// <summary>
    /// Administratorët e caktuar. Një klinikë mund të ketë disa — lista është
    /// bosh nëse s'i është caktuar ende asnjë.
    /// </summary>
    public required IReadOnlyList<ClinicAdministratorDto> Administrators { get; init; }

    /// <summary>Qytetet e degëve të klinikës (pa duplikatë) — bosh nëse ende s'ka asnjë degë.</summary>
    public required IReadOnlyList<string> Cities { get; init; }
}

/// <summary>
/// Të dhënat që frontend-i i duhen për të ngarkuar drejtpërdrejt te Cloudinary
/// me një signed upload — API secret-i mbetet vetëm në backend.
/// </summary>
public sealed record CloudinarySignatureDto
{
    public required string Signature { get; init; }
    public required long Timestamp { get; init; }
    public required string ApiKey { get; init; }
    public required string CloudName { get; init; }
    public required string Folder { get; init; }

    /// <summary>
    /// Lista e formateve (p.sh. "png,jpg,jpeg,webp") dhe kufiri i madhësisë, të dyja
    /// PJESË E NËNSHKRIMIT. Klienti duhet t'i dërgojë saktësisht ashtu siç i mori te
    /// kërkesa drejt Cloudinary-t — nëse i ndryshon ose i lë jashtë, nënshkrimi s'përputhet
    /// dhe ngarkimi refuzohet. Prandaj kthehen këtu: nuk janë sugjerime për UI-në, janë
    /// vlera që duhet të udhëtojnë bashkë me nënshkrimin.
    /// </summary>
    public required string AllowedFormats { get; init; }

    public required long MaxFileSizeBytes { get; init; }
}

public sealed record ClinicAdministratorDto
{
    public required Guid UserId { get; init; }
    public required string Email { get; init; }
    public required string FullName { get; init; }
}

public sealed record CreateBranchRequest
{
    public required string Name { get; init; }
    public required string Address { get; init; }
    public required string City { get; init; }
    public string? Municipality { get; init; }
    public decimal? Latitude { get; init; }
    public decimal? Longitude { get; init; }
    public string? PhoneNumber { get; init; }
}

public sealed record CreateMedicalServiceRequest
{
    public required Guid SpecialtyId { get; init; }
    public required string Name { get; init; }
    public string? Description { get; init; }
    public required int DurationMinutes { get; init; }
    public required decimal Price { get; init; }
    public string Currency { get; init; } = "EUR";
}

// ---------- Doktori ----------

public sealed record CreateDoctorRequest
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string Email { get; init; }
    public required string PhoneNumber { get; init; }

    /// <summary>Password fillestar — doktori duhet ta ndryshojë pas kyçjes së parë.</summary>
    public required string InitialPassword { get; init; }

    public required string LicenseNumber { get; init; }
    public string? Biography { get; init; }
    public required int YearsOfExperience { get; init; }
    public required IReadOnlyList<Guid> SpecialtyIds { get; init; }

    /// <summary>Degët e klinikës ku do të punojë — duhet t'i përkasin klinikës së URL-së.</summary>
    public required IReadOnlyList<Guid> BranchIds { get; init; }

    /// <summary>Shërbimet e klinikës që i ofron (opsionale në krijim).</summary>
    public IReadOnlyList<Guid> ServiceIds { get; init; } = [];
}

public sealed record UpdateDoctorRequest
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string PhoneNumber { get; init; }
    public required string LicenseNumber { get; init; }
    public string? Biography { get; init; }
    public required int YearsOfExperience { get; init; }
    public required IReadOnlyList<Guid> SpecialtyIds { get; init; }
}

/// <summary>Zëvendëson tërësisht degët e doktorit — jo shtim/heqje inkrementale.</summary>
public sealed record UpdateDoctorBranchesRequest
{
    public required IReadOnlyList<Guid> BranchIds { get; init; }
}

/// <summary>Override-et janë opsionale: null = përdoret çmimi/kohëzgjatja bazë e MedicalService.</summary>
public sealed record DoctorServiceAssignment
{
    public required Guid MedicalServiceId { get; init; }
    public int? CustomDurationMinutes { get; init; }
    public decimal? CustomPrice { get; init; }
}

/// <summary>Zëvendëson tërësisht shërbimet e doktorit — jo shtim/heqje inkrementale.</summary>
public sealed record UpdateDoctorServicesRequest
{
    public required IReadOnlyList<DoctorServiceAssignment> Services { get; init; }
}

public sealed record SetDoctorActiveRequest
{
    /// <summary>
    /// Vetëm për çaktivizim: nëse doktori ka termine të ardhshme aktive (Pending/Confirmed/
    /// CheckedIn/InProgress) dhe kjo fushë është false, çaktivizimi refuzohet me 409 —
    /// admini duhet ta kërkojë shprehimisht anulimin. true = ato anulohen automatikisht
    /// (CancelledByClinic) dhe pacientët njoftohen.
    /// </summary>
    public bool CancelFutureAppointments { get; init; }
}

public sealed record AdminDoctorSpecialtyDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
}

public sealed record AdminDoctorBranchDto
{
    public required Guid Id { get; init; }
    public required string Name { get; init; }
}

/// <summary>Kohëzgjatja/çmimi janë EFEKTIVE (override i doktorit kur ekziston, përndryshe vlera bazë e shërbimit).</summary>
public sealed record AdminDoctorServiceDto
{
    public required Guid MedicalServiceId { get; init; }
    public required string Name { get; init; }
    public required int DurationMinutes { get; init; }
    public required decimal Price { get; init; }
    public required string Currency { get; init; }
    public int? CustomDurationMinutes { get; init; }
    public decimal? CustomPrice { get; init; }
}

/// <summary>
/// Pamja e plotë administrative e një doktori — për listë (përfshin doktorë joaktivë, që
/// admini duhet t'i shohë për t'i riaktivizuar) dhe si përgjigje e çdo update/deactivate/activate.
/// </summary>
public sealed record AdminDoctorDetailDto
{
    public required Guid Id { get; init; }
    public required Guid UserId { get; init; }
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public required string Email { get; init; }
    public string? PhoneNumber { get; init; }
    public required string LicenseNumber { get; init; }
    public string? Biography { get; init; }
    public required int YearsOfExperience { get; init; }
    public required bool IsVerified { get; init; }
    public required bool IsActive { get; init; }
    public required IReadOnlyList<AdminDoctorSpecialtyDto> Specialties { get; init; }
    public required IReadOnlyList<AdminDoctorBranchDto> Branches { get; init; }
    public required IReadOnlyList<AdminDoctorServiceDto> Services { get; init; }
}

// ---------- SuperAdmin ----------

public sealed record AssignClinicAdminRequest
{
    /// <summary>Email i një useri ekzistues — i jepet roli ClinicAdmin dhe qasja në klinikë.</summary>
    public required string Email { get; init; }
}

public sealed record CreateSpecialtyRequest
{
    public required string Name { get; init; }
    public string? Description { get; init; }
}

public sealed record UpdateSpecialtyRequest
{
    public required string Name { get; init; }
    public string? Description { get; init; }
    public required bool IsActive { get; init; }
}

public sealed record AuditLogDto
{
    public required Guid Id { get; init; }
    public Guid? UserId { get; init; }

    /// <summary>Email-i i aktorit. Null = veprim i sistemit ose user i fshirë.</summary>
    public string? UserEmail { get; init; }

    public required string Action { get; init; }
    public required string EntityName { get; init; }
    public string? EntityId { get; init; }
    public string? OldValues { get; init; }
    public string? NewValues { get; init; }
    public string? IpAddress { get; init; }
    public required DateTime CreatedAt { get; init; }
}

public sealed record AuditLogQuery : PagedRequest
{
    public string? EntityName { get; init; }
    public Guid? UserId { get; init; }
    public DateOnly? From { get; init; }
    public DateOnly? To { get; init; }
}

// ---------- Përdoruesit (SuperAdmin) ----------

public sealed record AdminUsersQuery : PagedRequest
{
    /// <summary>Emri i rolit (Patient, Doctor, ClinicAdmin, SuperAdmin).</summary>
    public string? Role { get; init; }

    public bool? IsActive { get; init; }

    /// <summary>Kërkim i lirë në emër, mbiemër dhe email.</summary>
    public string? Search { get; init; }
}

public sealed record AdminUserDto
{
    public required Guid Id { get; init; }
    public required string FullName { get; init; }
    public required string Email { get; init; }

    /// <summary>Rolet e caktuara — normalisht një i vetëm.</summary>
    public required IReadOnlyList<string> Roles { get; init; }

    public required bool IsActive { get; init; }
    public required bool EmailConfirmed { get; init; }
    public required DateTime CreatedAt { get; init; }
}

// ---------- Terminet (admin) ----------

public sealed record AdminCreateAppointmentRequest
{
    /// <summary>
    /// Identifikuesi i pacientit nga kërkimi ose nga krijimi i tij
    /// (<c>api/admin/patients</c>). Rruga e preferuar: një pacient i krijuar me
    /// telefon mund të mos ketë fare email.
    /// </summary>
    public Guid? PatientProfileId { get; init; }

    /// <summary>
    /// Alternativë historike te <see cref="PatientProfileId"/>. Mbahet për
    /// pajtueshmëri; funksionon vetëm për pacientët që kanë email.
    /// </summary>
    public string? PatientEmail { get; init; }

    public required Guid DoctorId { get; init; }
    public required Guid ClinicBranchId { get; init; }
    public required Guid MedicalServiceId { get; init; }
    public Guid? DependentId { get; init; }

    /// <summary>Ora e Prishtinës.</summary>
    public required DateTime StartDateTime { get; init; }

    public string? PatientNote { get; init; }
    public string? InternalNote { get; init; }
}

public sealed record AdminUpdateAppointmentRequest
{
    public string? InternalNote { get; init; }

    /// <summary>Kalim statusi opsional (Confirmed, CheckedIn, InProgress, Completed, NoShow) — validohet me BookingPolicy.</summary>
    public AppointmentStatus? Status { get; init; }
}

public sealed record AdminCancelAppointmentRequest
{
    public string? Reason { get; init; }
}

public sealed record AdminRescheduleAppointmentRequest
{
    /// <summary>Ora e Prishtinës.</summary>
    public required DateTime NewStartDateTime { get; init; }
}

/// <summary>Filtrat e listës administrative të termineve. Të gjitha opsionale.</summary>
public sealed record AdminAppointmentsQuery : PagedRequest
{
    public Guid? ClinicId { get; init; }
    public Guid? DoctorId { get; init; }
    public Guid? ClinicBranchId { get; init; }
    public AppointmentStatus? Status { get; init; }

    /// <summary>Datë e Prishtinës — përfshirëse.</summary>
    public DateOnly? From { get; init; }

    /// <summary>Datë e Prishtinës — përfshirëse.</summary>
    public DateOnly? To { get; init; }

    /// <summary>Kërkim i lirë: emri i pacientit/dependentit ose ID e terminit (edhe pjesërisht).</summary>
    public string? Search { get; init; }
}

/// <summary>
/// Një rresht i tabelës administrative. I denormalizuar qëllimisht — frontend-i
/// e vizaton rreshtin pa asnjë kërkesë shtesë (pa N+1).
/// </summary>
public sealed record AdminAppointmentListItemDto
{
    public required Guid Id { get; init; }
    public required Guid ClinicId { get; init; }
    public required string ClinicName { get; init; }
    public required Guid ClinicBranchId { get; init; }
    public required string BranchName { get; init; }
    public required Guid DoctorId { get; init; }
    public required string DoctorName { get; init; }

    /// <summary>Specializimi i parë i doktorit — null nëse s'ka asnjë të caktuar.</summary>
    public string? DoctorSpecialty { get; init; }

    public required Guid MedicalServiceId { get; init; }
    public required string ServiceName { get; init; }

    /// <summary>Mbajtësi i llogarisë që e bëri rezervimin.</summary>
    public required string PatientName { get; init; }

    public required bool IsForDependent { get; init; }
    public Guid? DependentId { get; init; }
    public string? DependentName { get; init; }

    /// <summary>Ora lokale e Prishtinës.</summary>
    public required DateTime StartDateTime { get; init; }

    public required DateTime EndDateTime { get; init; }
    public required AppointmentStatus Status { get; init; }

    /// <summary>Token-i i konkurrencës (xmin) — kthehet te PUT-i pasues.</summary>
    public required uint Version { get; init; }
}

// ---------- Raporti ----------

public sealed record ClinicReportDto
{
    public required DateOnly From { get; init; }
    public required DateOnly To { get; init; }
    public required int TotalAppointments { get; init; }

    /// <summary>Numërimi i plotë sipas çdo statusi — çelësi është emri i AppointmentStatus.</summary>
    public required IReadOnlyDictionary<string, int> ByStatus { get; init; }

    public required int CompletedAppointments { get; init; }

    /// <summary>CancelledByPatient + CancelledByClinic të bashkuara.</summary>
    public required int CancelledAppointments { get; init; }

    public required int NoShowAppointments { get; init; }

    /// <summary>
    /// Vetëm terminet e përfunduara, me çmimin efektiv (DoctorService.CustomPrice
    /// kur ekziston, përndryshe MedicalService.Price).
    /// </summary>
    public required decimal TotalRevenue { get; init; }

    /// <summary>
    /// Valuta e të ardhurave. Supozohet një valutë e vetme për klinikë — nëse
    /// shërbimet kanë valuta të përziera, merret ajo më e shpeshtë dhe shuma
    /// duhet lexuar me kujdes.
    /// </summary>
    public required string Currency { get; init; }

    public required IReadOnlyList<DoctorAppointmentCountDto> ByDoctor { get; init; }
    public required IReadOnlyList<BranchReportRowDto> ByBranch { get; init; }
    public required IReadOnlyList<ServiceReportRowDto> ByService { get; init; }
}

public sealed record DoctorAppointmentCountDto
{
    public required Guid DoctorId { get; init; }
    public required string DoctorName { get; init; }
    public required int AppointmentCount { get; init; }
    public required int CompletedCount { get; init; }
    public required int CancelledCount { get; init; }
    public required int NoShowCount { get; init; }
    public required decimal Revenue { get; init; }
}

public sealed record BranchReportRowDto
{
    public required Guid BranchId { get; init; }
    public required string BranchName { get; init; }
    public required string City { get; init; }
    public required int AppointmentCount { get; init; }
    public required int CompletedCount { get; init; }
    public required int CancelledCount { get; init; }
    public required decimal Revenue { get; init; }
}

public sealed record ServiceReportRowDto
{
    public required Guid ServiceId { get; init; }
    public required string ServiceName { get; init; }
    public required string SpecialtyName { get; init; }

    /// <summary>Çmimi bazë i shërbimit — të ardhurat mund të ndryshojnë nga override-et e doktorit.</summary>
    public required decimal Price { get; init; }

    public required int AppointmentCount { get; init; }
    public required decimal Revenue { get; init; }
}
