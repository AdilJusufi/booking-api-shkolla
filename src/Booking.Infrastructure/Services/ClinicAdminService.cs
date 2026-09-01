using System.Security.Cryptography;
using System.Text;
using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Clinics;
using Booking.Application.Features.Schedules;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Infrastructure.Identity;
using Booking.Infrastructure.Persistence;
using FluentValidation;
using FluentValidation.Results;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Booking.Infrastructure.Services;

public class ClinicAdminService : IClinicAdminService
{
    private readonly BookingDbContext _dbContext;
    private readonly TenantAccessService _tenantAccess;
    private readonly IScheduleService _scheduleService;
    private readonly IAuditService _auditService;
    private readonly ITimeZoneService _timeZoneService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly UserManager<ApplicationUser> _userManager;
    private readonly CloudinarySettings _cloudinarySettings;
    private readonly IAppointmentNotificationService _notificationService;
    private readonly ILogger<ClinicAdminService> _logger;

    public ClinicAdminService(
        BookingDbContext dbContext,
        TenantAccessService tenantAccess,
        IScheduleService scheduleService,
        IAuditService auditService,
        ITimeZoneService timeZoneService,
        IDateTimeProvider dateTimeProvider,
        UserManager<ApplicationUser> userManager,
        IOptions<CloudinarySettings> cloudinarySettings,
        IAppointmentNotificationService notificationService,
        ILogger<ClinicAdminService> logger)
    {
        _dbContext = dbContext;
        _tenantAccess = tenantAccess;
        _scheduleService = scheduleService;
        _auditService = auditService;
        _timeZoneService = timeZoneService;
        _dateTimeProvider = dateTimeProvider;
        _userManager = userManager;
        _cloudinarySettings = cloudinarySettings.Value;
        _notificationService = notificationService;
        _logger = logger;
    }

    public async Task<IReadOnlyList<AdminClinicDto>> GetMyClinicsAsync(CancellationToken cancellationToken = default)
    {
        var query = _tenantAccess.IsSuperAdmin
            ? _dbContext.Clinics
            : _dbContext.Clinics.Where(c => _dbContext.ClinicAdministrators.Any(a =>
                a.UserId == _tenantAccess.CurrentUserId && a.ClinicId == c.Id));

        var clinics = await query
            .OrderBy(c => c.Name)
            .ToListAsync(cancellationToken);

        // Një query e vetme për të gjitha klinikat — pa N+1 për kolonën "Admin Klinikës".
        var clinicIds = clinics.Select(c => c.Id).ToList();
        var adminsByClinic = await ClinicAdministratorLookup.LoadAsync(_dbContext, clinicIds, cancellationToken);
        var citiesByClinic = await ClinicBranchCityLookup.LoadAsync(_dbContext, clinicIds, cancellationToken);

        return clinics
            .Select(c => ToAdminDto(
                c,
                adminsByClinic.TryGetValue(c.Id, out var admins) ? admins : [],
                citiesByClinic.TryGetValue(c.Id, out var cities) ? cities : []))
            .ToList();
    }

    public async Task<AdminClinicDto> CreateClinicAsync(CreateClinicRequest request, CancellationToken cancellationToken = default)
    {
        var clinic = new Clinic
        {
            Name = request.Name,
            Description = request.Description,
            PhoneNumber = request.PhoneNumber,
            Email = request.Email,
            Website = request.Website,
            IsApproved = false
        };
        _dbContext.Clinics.Add(clinic);

        _auditService.Record("CLINIC_CREATED", nameof(Clinic), clinic.Id.ToString(), null, new { clinic.Name });
        await _dbContext.SaveChangesAsync(cancellationToken);

        // Klinika e sapokrijuar s'ka ende administrator të caktuar.
        return ToAdminDto(clinic, [], []);
    }

    public async Task<AdminClinicDto> UpdateClinicAsync(
        Guid clinicId, UpdateClinicRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageClinicAsync(clinicId, cancellationToken);

        var clinic = await _dbContext.Clinics.FirstOrDefaultAsync(c => c.Id == clinicId, cancellationToken)
            ?? throw new NotFoundException("Clinic", clinicId);

        var oldValues = new { clinic.Name, clinic.Description, clinic.PhoneNumber, clinic.Email, clinic.Website, clinic.LogoUrl };

        clinic.Name = request.Name;
        clinic.Description = request.Description;
        clinic.PhoneNumber = request.PhoneNumber;
        clinic.Email = request.Email;
        clinic.Website = request.Website;
        clinic.LogoUrl = request.LogoUrl;

        _auditService.Record("CLINIC_UPDATED", nameof(Clinic), clinicId.ToString(), oldValues,
            new { clinic.Name, clinic.Description, clinic.PhoneNumber, clinic.Email, clinic.Website, clinic.LogoUrl });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return ToAdminDto(
            clinic,
            await ClinicAdministratorLookup.LoadForClinicAsync(_dbContext, clinicId, cancellationToken),
            await ClinicBranchCityLookup.LoadForClinicAsync(_dbContext, clinicId, cancellationToken));
    }

    public async Task<CloudinarySignatureDto> GenerateUploadSignatureAsync(
        Guid clinicId, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageClinicAsync(clinicId, cancellationToken);

        if (string.IsNullOrWhiteSpace(_cloudinarySettings.CloudName)
            || string.IsNullOrWhiteSpace(_cloudinarySettings.ApiKey)
            || string.IsNullOrWhiteSpace(_cloudinarySettings.ApiSecret))
        {
            throw new InvalidOperationException(
                "Cloudinary nuk është konfiguruar — mungon CloudName/ApiKey/ApiSecret.");
        }

        var timestamp = new DateTimeOffset(_dateTimeProvider.UtcNow, TimeSpan.Zero).ToUnixTimeSeconds();
        var folder = $"clinics/{clinicId}/logo";

        // Cloudinary signed uploads: nënshkruhen VETËM parametrat që dërgohen te
        // upload-i (përjashto file, cloud_name, api_key, resource_type) — të
        // renditur alfabetikisht si "key=value" të bashkuar me "&", plus api_secret,
        // të hashuar me SHA-1. https://cloudinary.com/documentation/signatures
        var paramsToSign = $"folder={folder}&timestamp={timestamp}";
        var toSign = paramsToSign + _cloudinarySettings.ApiSecret;
        var signature = Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(toSign))).ToLowerInvariant();

        return new CloudinarySignatureDto
        {
            Signature = signature,
            Timestamp = timestamp,
            ApiKey = _cloudinarySettings.ApiKey,
            CloudName = _cloudinarySettings.CloudName,
            Folder = folder
        };
    }

    public async Task<ClinicBranchDto> AddBranchAsync(
        Guid clinicId, CreateBranchRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageApprovedClinicAsync(clinicId, cancellationToken);

        var clinicExists = await _dbContext.Clinics.AnyAsync(c => c.Id == clinicId, cancellationToken);
        if (!clinicExists)
        {
            throw new NotFoundException("Clinic", clinicId);
        }

        var branch = new ClinicBranch
        {
            ClinicId = clinicId,
            Name = request.Name,
            Address = request.Address,
            City = request.City,
            Municipality = request.Municipality,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            PhoneNumber = request.PhoneNumber
        };
        _dbContext.ClinicBranches.Add(branch);

        _auditService.Record("BRANCH_CREATED", nameof(ClinicBranch), branch.Id.ToString(), null,
            new { branch.Name, branch.City, ClinicId = clinicId });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new ClinicBranchDto
        {
            Id = branch.Id,
            ClinicId = branch.ClinicId,
            Name = branch.Name,
            Address = branch.Address,
            City = branch.City,
            Municipality = branch.Municipality,
            Latitude = branch.Latitude,
            Longitude = branch.Longitude,
            PhoneNumber = branch.PhoneNumber
        };
    }

    public async Task<MedicalServiceDto> AddServiceAsync(
        Guid clinicId, CreateMedicalServiceRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageApprovedClinicAsync(clinicId, cancellationToken);

        var specialty = await _dbContext.Specialties
            .FirstOrDefaultAsync(s => s.Id == request.SpecialtyId && s.IsActive, cancellationToken)
            ?? throw new NotFoundException("Specialty", request.SpecialtyId);

        var service = new MedicalService
        {
            ClinicId = clinicId,
            SpecialtyId = request.SpecialtyId,
            Name = request.Name,
            Description = request.Description,
            DurationMinutes = request.DurationMinutes,
            Price = request.Price,
            Currency = request.Currency.ToUpperInvariant()
        };
        _dbContext.MedicalServices.Add(service);

        _auditService.Record("SERVICE_CREATED", nameof(MedicalService), service.Id.ToString(), null,
            new { service.Name, service.Price, ClinicId = clinicId });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return new MedicalServiceDto
        {
            Id = service.Id,
            ClinicId = service.ClinicId,
            SpecialtyId = service.SpecialtyId,
            SpecialtyName = specialty.Name,
            Name = service.Name,
            Description = service.Description,
            DurationMinutes = service.DurationMinutes,
            Price = service.Price,
            Currency = service.Currency
        };
    }

    public async Task<AdminDoctorDetailDto> CreateDoctorAsync(
        Guid clinicId, CreateDoctorRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageApprovedClinicAsync(clinicId, cancellationToken);

        // Degët dhe shërbimet duhet t'i përkasin klinikës së URL-së — kundër "mass assignment" mes klinikave.
        var clinicBranchIds = await _dbContext.ClinicBranches
            .Where(b => b.ClinicId == clinicId)
            .Select(b => b.Id)
            .ToListAsync(cancellationToken);
        if (request.BranchIds.Except(clinicBranchIds).Any())
        {
            throw new ForbiddenAccessException("Një ose më shumë degë nuk i përkasin kësaj klinike.");
        }

        var clinicServiceIds = await _dbContext.MedicalServices
            .Where(s => s.ClinicId == clinicId)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);
        if (request.ServiceIds.Except(clinicServiceIds).Any())
        {
            throw new ForbiddenAccessException("Një ose më shumë shërbime nuk i përkasin kësaj klinike.");
        }

        var validSpecialtyCount = await _dbContext.Specialties
            .CountAsync(s => request.SpecialtyIds.Contains(s.Id) && s.IsActive, cancellationToken);
        if (validSpecialtyCount != request.SpecialtyIds.Distinct().Count())
        {
            throw new NotFoundException("Një ose më shumë specializime nuk ekzistojnë.");
        }

        var existingUser = await _userManager.FindByEmailAsync(request.Email);
        if (existingUser is not null)
        {
            throw new ConflictException("email-exists", "Ekziston tashmë një llogari me këtë email.");
        }

        var licenseTaken = await _dbContext.Doctors.AnyAsync(d => d.LicenseNumber == request.LicenseNumber, cancellationToken);
        if (licenseTaken)
        {
            throw new ConflictException("license-exists", "Ky numër licence është i regjistruar tashmë.");
        }

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            PhoneNumber = request.PhoneNumber,
            FirstName = request.FirstName,
            LastName = request.LastName,
            EmailConfirmed = true, // llogaria krijohet nga administrata — s'ka nevojë për konfirmim
            CreatedAt = _dateTimeProvider.UtcNow
        };
        var createResult = await _userManager.CreateAsync(user, request.InitialPassword);
        if (!createResult.Succeeded)
        {
            throw new ValidationException(
                createResult.Errors.Select(e => new ValidationFailure(e.Code, e.Description)).ToList());
        }

        await _userManager.AddToRoleAsync(user, Roles.Doctor);

        var doctor = new Doctor
        {
            UserId = user.Id,
            LicenseNumber = request.LicenseNumber,
            Biography = request.Biography,
            YearsOfExperience = request.YearsOfExperience,
            IsVerified = true // i verifikuar sepse e krijoi administrata e klinikës
        };
        _dbContext.Doctors.Add(doctor);

        foreach (var specialtyId in request.SpecialtyIds.Distinct())
        {
            _dbContext.DoctorSpecialties.Add(new DoctorSpecialty { DoctorId = doctor.Id, SpecialtyId = specialtyId });
        }

        foreach (var branchId in request.BranchIds.Distinct())
        {
            _dbContext.DoctorClinicBranches.Add(new DoctorClinicBranch { DoctorId = doctor.Id, ClinicBranchId = branchId });
        }

        foreach (var serviceId in request.ServiceIds.Distinct())
        {
            _dbContext.DoctorServices.Add(new DoctorService { DoctorId = doctor.Id, MedicalServiceId = serviceId });
        }

        _auditService.Record("DOCTOR_CREATED", nameof(Doctor), doctor.Id.ToString(), null,
            new { doctor.LicenseNumber, ClinicId = clinicId, request.Email });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await QueryDoctorDetails(d => d.Id == doctor.Id).FirstAsync(cancellationToken);
    }

    /// <summary>
    /// Ndryshe nga GET /api/clinics/{id}/doctors (publik), këtu përfshihen edhe doktorët
    /// joaktivë — admini duhet t'i shohë për t'i riaktivizuar, jo vetëm ata ende të kërkueshëm.
    /// </summary>
    public async Task<IReadOnlyList<AdminDoctorDetailDto>> GetDoctorsAsync(
        Guid clinicId, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageApprovedClinicAsync(clinicId, cancellationToken);

        var doctors = await QueryDoctorDetails(d => d.DoctorClinicBranches.Any(dcb => dcb.ClinicBranch.ClinicId == clinicId))
            .ToListAsync(cancellationToken);

        return doctors.OrderBy(d => d.LastName).ThenBy(d => d.FirstName).ToList();
    }

    public async Task<AdminDoctorDetailDto> UpdateDoctorAsync(
        Guid doctorId, UpdateDoctorRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);

        var doctor = await _dbContext.Doctors.FirstOrDefaultAsync(d => d.Id == doctorId, cancellationToken)
            ?? throw new NotFoundException("Doctor", doctorId);
        var user = await _dbContext.Users.FirstAsync(u => u.Id == doctor.UserId, cancellationToken);

        var licenseTaken = await _dbContext.Doctors
            .AnyAsync(d => d.Id != doctorId && d.LicenseNumber == request.LicenseNumber, cancellationToken);
        if (licenseTaken)
        {
            throw new ConflictException("license-exists", "Ky numër licence është i regjistruar tashmë.");
        }

        var requestedSpecialtyIds = request.SpecialtyIds.Distinct().ToList();
        var validSpecialtyCount = await _dbContext.Specialties
            .CountAsync(s => requestedSpecialtyIds.Contains(s.Id) && s.IsActive, cancellationToken);
        if (validSpecialtyCount != requestedSpecialtyIds.Count)
        {
            throw new NotFoundException("Një ose më shumë specializime nuk ekzistojnë.");
        }

        var oldValues = new
        {
            doctor.LicenseNumber, doctor.Biography, doctor.YearsOfExperience,
            user.FirstName, user.LastName, user.PhoneNumber
        };

        user.FirstName = request.FirstName;
        user.LastName = request.LastName;
        user.PhoneNumber = request.PhoneNumber;

        doctor.LicenseNumber = request.LicenseNumber;
        doctor.Biography = request.Biography;
        doctor.YearsOfExperience = request.YearsOfExperience;

        var existingSpecialties = await _dbContext.DoctorSpecialties
            .Where(ds => ds.DoctorId == doctorId)
            .ToListAsync(cancellationToken);
        var toRemove = existingSpecialties.Where(ds => !requestedSpecialtyIds.Contains(ds.SpecialtyId)).ToList();
        var toAddIds = requestedSpecialtyIds.Except(existingSpecialties.Select(ds => ds.SpecialtyId)).ToList();
        _dbContext.DoctorSpecialties.RemoveRange(toRemove);
        foreach (var specialtyId in toAddIds)
        {
            _dbContext.DoctorSpecialties.Add(new DoctorSpecialty { DoctorId = doctorId, SpecialtyId = specialtyId });
        }

        _auditService.Record("DOCTOR_UPDATED", nameof(Doctor), doctorId.ToString(), oldValues,
            new
            {
                doctor.LicenseNumber, doctor.Biography, doctor.YearsOfExperience,
                user.FirstName, user.LastName, user.PhoneNumber
            });

        await _dbContext.SaveChangesAsync(cancellationToken);

        return await QueryDoctorDetails(d => d.Id == doctorId).FirstAsync(cancellationToken);
    }

    public async Task<AdminDoctorDetailDto> UpdateDoctorBranchesAsync(
        Guid doctorId, UpdateDoctorBranchesRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);

        var clinicId = await GetDoctorClinicIdAsync(doctorId, cancellationToken);

        var clinicBranchIds = await _dbContext.ClinicBranches
            .Where(b => b.ClinicId == clinicId)
            .Select(b => b.Id)
            .ToListAsync(cancellationToken);
        if (request.BranchIds.Except(clinicBranchIds).Any())
        {
            throw new ForbiddenAccessException("Një ose më shumë degë nuk i përkasin kësaj klinike.");
        }

        var requestedIds = request.BranchIds.Distinct().ToList();
        var existing = await _dbContext.DoctorClinicBranches
            .Where(dcb => dcb.DoctorId == doctorId)
            .ToListAsync(cancellationToken);
        var toRemove = existing.Where(dcb => !requestedIds.Contains(dcb.ClinicBranchId)).ToList();
        var toAddIds = requestedIds.Except(existing.Select(dcb => dcb.ClinicBranchId)).ToList();
        _dbContext.DoctorClinicBranches.RemoveRange(toRemove);
        foreach (var branchId in toAddIds)
        {
            _dbContext.DoctorClinicBranches.Add(new DoctorClinicBranch { DoctorId = doctorId, ClinicBranchId = branchId });
        }

        _auditService.Record("DOCTOR_BRANCHES_UPDATED", nameof(DoctorClinicBranch), doctorId.ToString(), null,
            new { BranchIds = requestedIds });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await QueryDoctorDetails(d => d.Id == doctorId).FirstAsync(cancellationToken);
    }

    /// <summary>
    /// Vetëm sa asgjë s'e rezervon dot doktorin pa shërbime — shih raportin. Override-et
    /// (kohëzgjatje/çmim) ekspozohen që tani: DoctorService i ka që në modelin e domain-it
    /// dhe raporti i klinikës (GetReportAsync) tashmë i mbështetet për çmimin efektiv.
    /// </summary>
    public async Task<AdminDoctorDetailDto> UpdateDoctorServicesAsync(
        Guid doctorId, UpdateDoctorServicesRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);

        var clinicId = await GetDoctorClinicIdAsync(doctorId, cancellationToken);

        var requestedIds = request.Services.Select(s => s.MedicalServiceId).ToList();
        var clinicServiceIds = await _dbContext.MedicalServices
            .Where(s => s.ClinicId == clinicId)
            .Select(s => s.Id)
            .ToListAsync(cancellationToken);
        if (requestedIds.Except(clinicServiceIds).Any())
        {
            throw new ForbiddenAccessException("Një ose më shumë shërbime nuk i përkasin kësaj klinike.");
        }

        var existing = await _dbContext.DoctorServices
            .Where(ds => ds.DoctorId == doctorId)
            .ToListAsync(cancellationToken);
        var requestedById = request.Services.ToDictionary(s => s.MedicalServiceId);

        var toRemove = existing.Where(ds => !requestedById.ContainsKey(ds.MedicalServiceId)).ToList();
        _dbContext.DoctorServices.RemoveRange(toRemove);

        foreach (var doctorService in existing.Where(ds => requestedById.ContainsKey(ds.MedicalServiceId)))
        {
            var assignment = requestedById[doctorService.MedicalServiceId];
            doctorService.CustomDurationMinutes = assignment.CustomDurationMinutes;
            doctorService.CustomPrice = assignment.CustomPrice;
        }

        var existingIds = existing.Select(ds => ds.MedicalServiceId).ToHashSet();
        foreach (var assignment in request.Services.Where(a => !existingIds.Contains(a.MedicalServiceId)))
        {
            _dbContext.DoctorServices.Add(new DoctorService
            {
                DoctorId = doctorId,
                MedicalServiceId = assignment.MedicalServiceId,
                CustomDurationMinutes = assignment.CustomDurationMinutes,
                CustomPrice = assignment.CustomPrice
            });
        }

        _auditService.Record("DOCTOR_SERVICES_UPDATED", nameof(DoctorService), doctorId.ToString(), null,
            new { ServiceIds = requestedIds });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return await QueryDoctorDetails(d => d.Id == doctorId).FirstAsync(cancellationToken);
    }

    /// <summary>
    /// Bllokohet nëse doktori ka termine të ardhshme aktive dhe request nuk kërkon
    /// shprehimisht anulimin e tyre — shih SetDoctorActiveRequest. Anulimi (kur kërkohet)
    /// dhe njoftimi i pacientëve ndodhin PAS ruajtjes së çaktivizimit; dështimi i një email-i
    /// nuk e zhbën çaktivizimin, i cili tashmë është kryer.
    /// </summary>
    public async Task<AdminDoctorDetailDto> DeactivateDoctorAsync(
        Guid doctorId, SetDoctorActiveRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);

        var doctor = await _dbContext.Doctors.FirstOrDefaultAsync(d => d.Id == doctorId, cancellationToken)
            ?? throw new NotFoundException("Doctor", doctorId);

        if (!doctor.IsActive)
        {
            return await QueryDoctorDetails(d => d.Id == doctorId).FirstAsync(cancellationToken);
        }

        var utcNow = _dateTimeProvider.UtcNow;
        var futureBlocking = await _dbContext.Appointments
            .Where(a => a.DoctorId == doctorId
                        && Appointment.BlockingStatuses.Contains(a.Status)
                        && a.StartDateTime > utcNow)
            .ToListAsync(cancellationToken);

        if (futureBlocking.Count > 0 && !request.CancelFutureAppointments)
        {
            throw new ConflictException(
                "doctor-has-future-appointments",
                $"Doktori ka {futureBlocking.Count} termine të ardhshme aktive. " +
                "Kërkoni shprehimisht anulimin e tyre për ta çaktivizuar.");
        }

        doctor.IsActive = false;
        _auditService.Record("DOCTOR_DEACTIVATED", nameof(Doctor), doctorId.ToString(),
            new { IsActive = true }, new { IsActive = false, CancelledAppointmentCount = futureBlocking.Count });

        var appointmentIdsToNotify = new List<Guid>();
        foreach (var appointment in futureBlocking)
        {
            appointment.Status = AppointmentStatus.CancelledByClinic;
            appointment.CancellationReason = "Doktori nuk është më aktiv në klinikë.";
            appointment.CancelledByUserId = _tenantAccess.CurrentUserId;
            appointment.CancelledAt = utcNow;
            appointmentIdsToNotify.Add(appointment.Id);
        }

        await _dbContext.SaveChangesAsync(cancellationToken);

        foreach (var appointmentId in appointmentIdsToNotify)
        {
            await NotifyPatientCancelledSafeAsync(appointmentId, cancellationToken);
        }

        return await QueryDoctorDetails(d => d.Id == doctorId).FirstAsync(cancellationToken);
    }

    public async Task<AdminDoctorDetailDto> ActivateDoctorAsync(
        Guid doctorId, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);

        var doctor = await _dbContext.Doctors.FirstOrDefaultAsync(d => d.Id == doctorId, cancellationToken)
            ?? throw new NotFoundException("Doctor", doctorId);

        if (!doctor.IsActive)
        {
            doctor.IsActive = true;
            _auditService.Record("DOCTOR_ACTIVATED", nameof(Doctor), doctorId.ToString(),
                new { IsActive = false }, new { IsActive = true });
            await _dbContext.SaveChangesAsync(cancellationToken);
        }

        return await QueryDoctorDetails(d => d.Id == doctorId).FirstAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<WorkingScheduleDto>> GetDoctorSchedulesAsync(
        Guid doctorId, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);

        return await _scheduleService.GetSchedulesAsync(doctorId, cancellationToken);
    }

    public async Task<WorkingScheduleDto> AddDoctorScheduleAsync(
        Guid doctorId, CreateWorkingScheduleRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);

        var schedule = await _scheduleService.AddScheduleAsync(doctorId, request, cancellationToken);

        _auditService.Record("SCHEDULE_CREATED_BY_ADMIN", nameof(DoctorWorkingSchedule), schedule.Id.ToString(), null,
            new { DoctorId = doctorId, request.DayOfWeek, request.StartTime, request.EndTime });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return schedule;
    }

    public async Task<UnavailabilityDto> AddDoctorUnavailabilityAsync(
        Guid doctorId, CreateUnavailabilityRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageDoctorAsync(doctorId, cancellationToken);

        var unavailability = await _scheduleService.AddUnavailabilityAsync(doctorId, request, cancellationToken);

        _auditService.Record("UNAVAILABILITY_CREATED_BY_ADMIN", nameof(DoctorUnavailability),
            unavailability.Id.ToString(), null,
            new { DoctorId = doctorId, request.StartDateTime, request.EndDateTime, request.Reason });
        await _dbContext.SaveChangesAsync(cancellationToken);

        return unavailability;
    }

    public async Task<ClinicReportDto> GetReportAsync(
        Guid clinicId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageClinicAsync(clinicId, cancellationToken);

        var fromUtc = _timeZoneService.ToUtc(from.ToDateTime(TimeOnly.MinValue));
        var toUtc = _timeZoneService.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue));

        // TË GJITHA agregimet vijnë nga NJË query i vetëm me GROUPING SETS: një kalim mbi
        // fetën e termineve të intervalit, pesë grupime njëherësh (status, doktor, degë,
        // shërbim, valutë). Është SQL i papërpunuar me qëllim — me LINQ, EF 8 e ri-rrënjos
        // çdo GroupBy mbi projeksion te tabela dhe e nxjerr shumën e çmimit si nën-query të
        // KORRELUAR për çdo grup, pra një skanim i të gjithë intervalit për çdo doktor/degë/
        // shërbim. Sintaksa është specifike për PostgreSQL — si exclusion constraint-i i
        // termineve, projekti është tashmë i lidhur me PostgreSQL.
        //
        // Çmimi efektiv: DoctorService.CustomPrice e mbivendos MedicalService.Price. Left join
        // sepse rreshti DoctorService mund të mos ekzistojë më për një termin historik; çelësi
        // i tij (DoctorId, MedicalServiceId) është PK, prandaj s'ka dyfishim rreshtash.
        //
        // Në rreshtat e një grupimi, kolonat e grupimeve të tjera dalin NULL — kështu dallohet
        // se cilit dimension i përket rreshti (asnjë nga këto kolona s'është null në të dhëna).
        var aggregates = await _dbContext.Database
            .SqlQuery<ReportAggregateRow>($"""
                SELECT
                    a."DoctorId"                                                    AS "DoctorId",
                    a."ClinicBranchId"                                              AS "BranchId",
                    a."MedicalServiceId"                                            AS "ServiceId",
                    a."Status"                                                      AS "Status",
                    m."Currency"                                                    AS "Currency",
                    COUNT(*)::int                                                   AS "Total",
                    (COUNT(*) FILTER (WHERE a."Status" = 'Completed'))::int         AS "Completed",
                    (COUNT(*) FILTER (WHERE a."Status" IN ('CancelledByPatient', 'CancelledByClinic')))::int
                                                                                    AS "Cancelled",
                    (COUNT(*) FILTER (WHERE a."Status" = 'NoShow'))::int            AS "NoShow",
                    COALESCE(SUM(COALESCE(ds."CustomPrice", m."Price"))
                             FILTER (WHERE a."Status" = 'Completed'), 0)            AS "Revenue"
                FROM "Appointments" AS a
                INNER JOIN "MedicalServices" AS m ON m."Id" = a."MedicalServiceId"
                LEFT JOIN "DoctorServices" AS ds
                    ON ds."DoctorId" = a."DoctorId" AND ds."MedicalServiceId" = a."MedicalServiceId"
                WHERE a."ClinicId" = {clinicId}
                  AND a."StartDateTime" >= {fromUtc}
                  AND a."StartDateTime" < {toUtc}
                GROUP BY GROUPING SETS (
                    (a."Status"),
                    (a."DoctorId"),
                    (a."ClinicBranchId"),
                    (a."MedicalServiceId"),
                    (m."Currency")
                )
                """)
            .ToListAsync(cancellationToken);

        var byStatus = aggregates
            .Where(r => r.Status is not null)
            .Select(r => new { Status = Enum.Parse<AppointmentStatus>(r.Status!), Count = r.Total })
            .ToList();

        var byDoctorRows = aggregates.Where(r => r.DoctorId is not null).ToList();
        var byBranchRows = aggregates.Where(r => r.BranchId is not null).ToList();
        var byServiceRows = aggregates.Where(r => r.ServiceId is not null).ToList();
        var currencyTotals = aggregates.Where(r => r.Currency is not null).ToList();

        // Emrat vijnë nga tabela të vogla lookup-i, jo nga terminet — të kufizuara te
        // çelësat që dolën nga agregimet, prandaj mbeten konstante ndaj gjerësisë së intervalit.
        var doctorIds = byDoctorRows.Select(d => d.DoctorId!.Value).ToList();
        var doctorNames = await _dbContext.Doctors
            .Where(d => doctorIds.Contains(d.Id))
            .Join(_dbContext.Users, d => d.UserId, u => u.Id, (d, u) => new
            {
                DoctorId = d.Id,
                FullName = u.FirstName + " " + u.LastName
            })
            .ToDictionaryAsync(x => x.DoctorId, x => x.FullName, cancellationToken);

        var branchIds = byBranchRows.Select(b => b.BranchId!.Value).ToList();
        var branches = await _dbContext.ClinicBranches
            .Where(b => branchIds.Contains(b.Id))
            .Select(b => new { b.Id, b.Name, b.City })
            .ToDictionaryAsync(b => b.Id, cancellationToken);

        var serviceIds = byServiceRows.Select(s => s.ServiceId!.Value).ToList();
        var services = await _dbContext.MedicalServices
            .Where(s => serviceIds.Contains(s.Id))
            .Select(s => new { s.Id, s.Name, SpecialtyName = s.Specialty.Name, s.Price })
            .ToDictionaryAsync(s => s.Id, cancellationToken);

        var statusCounts = byStatus.ToDictionary(s => s.Status, s => s.Count);
        int StatusCount(AppointmentStatus status) => statusCounts.TryGetValue(status, out var c) ? c : 0;

        var dominantCurrency = currencyTotals
            .Where(c => c.Completed > 0)
            .OrderByDescending(c => c.Completed)
            .Select(c => c.Currency)
            .FirstOrDefault()
            // Pa termine të përfunduara s'ka valutë të nxjerrë nga të ardhurat — bie te
            // valuta mbizotëruese e listës së çmimeve të klinikës, jo te një "EUR" i ngurtë.
            ?? await _dbContext.MedicalServices
                .Where(s => s.ClinicId == clinicId)
                .GroupBy(s => s.Currency)
                .OrderByDescending(g => g.Count())
                .Select(g => g.Key)
                .FirstOrDefaultAsync(cancellationToken)
            ?? "EUR";

        return new ClinicReportDto
        {
            From = from,
            To = to,
            TotalAppointments = byStatus.Sum(s => s.Count),
            ByStatus = byStatus.ToDictionary(s => s.Status.ToString(), s => s.Count),
            CompletedAppointments = StatusCount(AppointmentStatus.Completed),
            CancelledAppointments =
                StatusCount(AppointmentStatus.CancelledByPatient)
                + StatusCount(AppointmentStatus.CancelledByClinic),
            NoShowAppointments = StatusCount(AppointmentStatus.NoShow),
            // Nga ByDoctor: çdo termin ka doktor, prandaj shuma është e njëjtë me totalin
            // dhe raporti mbetet gjithmonë konsistent me zbërthimin e vet.
            TotalRevenue = byDoctorRows.Sum(d => d.Revenue),
            Currency = dominantCurrency,
            ByDoctor = byDoctorRows
                .Select(d => new DoctorAppointmentCountDto
                {
                    DoctorId = d.DoctorId!.Value,
                    DoctorName = doctorNames.TryGetValue(d.DoctorId!.Value, out var name) ? name : "?",
                    AppointmentCount = d.Total,
                    CompletedCount = d.Completed,
                    CancelledCount = d.Cancelled,
                    NoShowCount = d.NoShow,
                    Revenue = d.Revenue
                })
                .OrderByDescending(d => d.AppointmentCount)
                .ToList(),
            ByBranch = byBranchRows
                .Select(b => new BranchReportRowDto
                {
                    BranchId = b.BranchId!.Value,
                    BranchName = branches.TryGetValue(b.BranchId!.Value, out var branch) ? branch.Name : "?",
                    City = branches.TryGetValue(b.BranchId!.Value, out var branchCity) ? branchCity.City : "?",
                    AppointmentCount = b.Total,
                    CompletedCount = b.Completed,
                    CancelledCount = b.Cancelled,
                    Revenue = b.Revenue
                })
                .OrderByDescending(b => b.AppointmentCount)
                .ToList(),
            ByService = byServiceRows
                .Select(s => new ServiceReportRowDto
                {
                    ServiceId = s.ServiceId!.Value,
                    ServiceName = services.TryGetValue(s.ServiceId!.Value, out var service) ? service.Name : "?",
                    SpecialtyName = services.TryGetValue(s.ServiceId!.Value, out var serviceSpecialty)
                        ? serviceSpecialty.SpecialtyName
                        : "?",
                    Price = services.TryGetValue(s.ServiceId!.Value, out var servicePrice) ? servicePrice.Price : 0m,
                    AppointmentCount = s.Total,
                    Revenue = s.Revenue
                })
                .OrderByDescending(s => s.AppointmentCount)
                .ToList()
        };
    }

    /// <summary>
    /// Një rresht i query-t me GROUPING SETS të raportit. Kolonat e dimensioneve që nuk bëjnë
    /// pjesë në grupimin e atij rreshti vijnë NULL — prandaj janë të gjitha nullable.
    /// </summary>
    private sealed class ReportAggregateRow
    {
        public Guid? DoctorId { get; set; }
        public Guid? BranchId { get; set; }
        public Guid? ServiceId { get; set; }
        public string? Status { get; set; }
        public string? Currency { get; set; }
        public int Total { get; set; }
        public int Completed { get; set; }
        public int Cancelled { get; set; }
        public int NoShow { get; set; }
        public decimal Revenue { get; set; }
    }

    /// <summary>Klinika e vetme e doktorit, e nxjerrë nga degët e tij aktuale — çdo doktor punon në degë të një klinike të vetme.</summary>
    private async Task<Guid> GetDoctorClinicIdAsync(Guid doctorId, CancellationToken cancellationToken) =>
        await _dbContext.DoctorClinicBranches
            .Where(dcb => dcb.DoctorId == doctorId)
            .Select(dcb => dcb.ClinicBranch.ClinicId)
            .FirstAsync(cancellationToken);

    /// <summary>
    /// Projeksioni i plotë i AdminDoctorDetailDto — i ndarë sepse e përdorin krijimi,
    /// lista dhe çdo update/deactivate/activate, që të kthejnë gjithmonë të njëjtën pamje.
    /// </summary>
    private IQueryable<AdminDoctorDetailDto> QueryDoctorDetails(
        System.Linq.Expressions.Expression<Func<Doctor, bool>> predicate)
    {
        return _dbContext.Doctors
            .Where(predicate)
            .Select(d => new AdminDoctorDetailDto
            {
                Id = d.Id,
                UserId = d.UserId,
                FirstName = _dbContext.Users.Where(u => u.Id == d.UserId).Select(u => u.FirstName).First(),
                LastName = _dbContext.Users.Where(u => u.Id == d.UserId).Select(u => u.LastName).First(),
                Email = _dbContext.Users.Where(u => u.Id == d.UserId).Select(u => u.Email!).First(),
                PhoneNumber = _dbContext.Users.Where(u => u.Id == d.UserId).Select(u => u.PhoneNumber).First(),
                LicenseNumber = d.LicenseNumber,
                Biography = d.Biography,
                YearsOfExperience = d.YearsOfExperience,
                IsVerified = d.IsVerified,
                IsActive = d.IsActive,
                Specialties = d.DoctorSpecialties
                    .Select(ds => new AdminDoctorSpecialtyDto { Id = ds.SpecialtyId, Name = ds.Specialty.Name })
                    .ToList(),
                Branches = d.DoctorClinicBranches
                    .Where(dcb => dcb.IsActive)
                    .Select(dcb => new AdminDoctorBranchDto { Id = dcb.ClinicBranchId, Name = dcb.ClinicBranch.Name })
                    .ToList(),
                Services = d.DoctorServices
                    .Where(ds => ds.IsActive)
                    .Select(ds => new AdminDoctorServiceDto
                    {
                        MedicalServiceId = ds.MedicalServiceId,
                        Name = ds.MedicalService.Name,
                        DurationMinutes = ds.CustomDurationMinutes ?? ds.MedicalService.DurationMinutes,
                        Price = ds.CustomPrice ?? ds.MedicalService.Price,
                        Currency = ds.MedicalService.Currency,
                        CustomDurationMinutes = ds.CustomDurationMinutes,
                        CustomPrice = ds.CustomPrice
                    })
                    .ToList()
            });
    }

    /// <summary>
    /// Njofton pacientin që termini i tij u anulua sepse doktori u çaktivizua. Vetëm
    /// pacienti — jo doktori (ai vetë sapo u çaktivizua) dhe jo klinika (ajo e kreu veprimin).
    /// </summary>
    private async Task NotifyPatientCancelledSafeAsync(Guid appointmentId, CancellationToken cancellationToken)
    {
        try
        {
            var info = await _dbContext.Appointments
                .Where(a => a.Id == appointmentId)
                .Select(a => new
                {
                    PatientUserId = a.PatientProfile.UserId,
                    ClinicName = a.Clinic.Name,
                    ServiceName = a.MedicalService.Name,
                    a.StartDateTime,
                    DoctorName = _dbContext.Users.Where(u => u.Id == a.Doctor.UserId).Select(u => u.FirstName + " " + u.LastName).First()
                })
                .FirstAsync(cancellationToken);

            var patientUser = await _dbContext.Users
                .Where(u => u.Id == info.PatientUserId)
                .Select(u => new { u.Email, u.PhoneNumber, u.FirstName, u.LastName })
                .FirstAsync(cancellationToken);

            await _notificationService.AppointmentCancelledAsync(new AppointmentNotificationContext
            {
                AppointmentId = appointmentId,
                PatientEmail = patientUser.Email,
                PatientPhoneNumber = patientUser.PhoneNumber,
                PatientName = $"{patientUser.FirstName} {patientUser.LastName}",
                DoctorName = info.DoctorName,
                ClinicName = info.ClinicName,
                ServiceName = info.ServiceName,
                StartDateTimeLocal = _timeZoneService.ToLocal(info.StartDateTime)
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Njoftimi i anulimit (çaktivizim doktori) dështoi për terminin {AppointmentId}", appointmentId);
        }
    }

    private static AdminClinicDto ToAdminDto(
        Clinic clinic, IReadOnlyList<ClinicAdministratorDto> administrators, IReadOnlyList<string> cities) => new()
    {
        Id = clinic.Id,
        Name = clinic.Name,
        Description = clinic.Description,
        PhoneNumber = clinic.PhoneNumber,
        Email = clinic.Email,
        Website = clinic.Website,
        LogoUrl = clinic.LogoUrl,
        IsApproved = clinic.IsApproved,
        IsActive = clinic.IsActive,
        CreatedAt = clinic.CreatedAt,
        Administrators = administrators,
        Cities = cities
    };
}
