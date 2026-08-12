using System.Security.Cryptography;
using System.Text;
using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
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

    public ClinicAdminService(
        BookingDbContext dbContext,
        TenantAccessService tenantAccess,
        IScheduleService scheduleService,
        IAuditService auditService,
        ITimeZoneService timeZoneService,
        IDateTimeProvider dateTimeProvider,
        UserManager<ApplicationUser> userManager,
        IOptions<CloudinarySettings> cloudinarySettings)
    {
        _dbContext = dbContext;
        _tenantAccess = tenantAccess;
        _scheduleService = scheduleService;
        _auditService = auditService;
        _timeZoneService = timeZoneService;
        _dateTimeProvider = dateTimeProvider;
        _userManager = userManager;
        _cloudinarySettings = cloudinarySettings.Value;
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
        var adminsByClinic = await ClinicAdministratorLookup.LoadAsync(
            _dbContext, clinics.Select(c => c.Id).ToList(), cancellationToken);

        return clinics
            .Select(c => ToAdminDto(
                c,
                adminsByClinic.TryGetValue(c.Id, out var admins) ? admins : []))
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
        return ToAdminDto(clinic, []);
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

        return ToAdminDto(clinic, await ClinicAdministratorLookup.LoadForClinicAsync(_dbContext, clinicId, cancellationToken));
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
        await _tenantAccess.EnsureCanManageClinicAsync(clinicId, cancellationToken);

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
        await _tenantAccess.EnsureCanManageClinicAsync(clinicId, cancellationToken);

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

    public async Task<AdminDoctorDto> CreateDoctorAsync(
        Guid clinicId, CreateDoctorRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageClinicAsync(clinicId, cancellationToken);

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

        return new AdminDoctorDto
        {
            Id = doctor.Id,
            UserId = user.Id,
            FirstName = user.FirstName,
            LastName = user.LastName,
            Email = user.Email!,
            LicenseNumber = doctor.LicenseNumber,
            IsVerified = doctor.IsVerified,
            IsActive = doctor.IsActive
        };
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

        var appointments = _dbContext.Appointments
            .Where(a => a.ClinicId == clinicId && a.StartDateTime >= fromUtc && a.StartDateTime < toUtc);

        // Të ardhurat llogariten VETËM nga terminet e përfunduara dhe me çmimin efektiv:
        // DoctorService.CustomPrice e mbivendos MedicalService.Price. Left join sepse
        // rreshti DoctorService mund të mos ekzistojë më për një termin historik.
        var revenueRows =
            from a in appointments
            where a.Status == AppointmentStatus.Completed
            join ds in _dbContext.DoctorServices
                on new { a.DoctorId, a.MedicalServiceId } equals new { ds.DoctorId, ds.MedicalServiceId }
                into doctorServices
            from ds in doctorServices.DefaultIfEmpty()
            select new
            {
                a.DoctorId,
                a.ClinicBranchId,
                a.MedicalServiceId,
                Price = ds != null && ds.CustomPrice != null ? ds.CustomPrice.Value : a.MedicalService.Price,
                a.MedicalService.Currency
            };

        // Të gjitha agregimet bëhen në SQL (GROUP BY) — asnjë rresht termini nuk
        // tërhiqet në memorie, prandaj intervalet e gjera mbeten të lira.
        var byStatus = await appointments
            .GroupBy(a => a.Status)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .ToListAsync(cancellationToken);

        var byDoctorCounts = await appointments
            .GroupBy(a => a.DoctorId)
            .Select(g => new
            {
                DoctorId = g.Key,
                Count = g.Count(),
                Completed = g.Sum(a => a.Status == AppointmentStatus.Completed ? 1 : 0),
                Cancelled = g.Sum(a =>
                    a.Status == AppointmentStatus.CancelledByPatient
                    || a.Status == AppointmentStatus.CancelledByClinic
                        ? 1
                        : 0),
                NoShow = g.Sum(a => a.Status == AppointmentStatus.NoShow ? 1 : 0),
                UserId = g.Select(a => a.Doctor.UserId).First()
            })
            .ToListAsync(cancellationToken);

        var byDoctorRevenue = await revenueRows
            .GroupBy(r => r.DoctorId)
            .Select(g => new { DoctorId = g.Key, Revenue = g.Sum(r => r.Price) })
            .ToDictionaryAsync(x => x.DoctorId, x => x.Revenue, cancellationToken);

        var byBranchCounts = await appointments
            .GroupBy(a => a.ClinicBranchId)
            .Select(g => new
            {
                BranchId = g.Key,
                BranchName = g.Select(a => a.ClinicBranch.Name).First(),
                City = g.Select(a => a.ClinicBranch.City).First(),
                Count = g.Count(),
                Completed = g.Sum(a => a.Status == AppointmentStatus.Completed ? 1 : 0),
                Cancelled = g.Sum(a =>
                    a.Status == AppointmentStatus.CancelledByPatient
                    || a.Status == AppointmentStatus.CancelledByClinic
                        ? 1
                        : 0)
            })
            .ToListAsync(cancellationToken);

        var byBranchRevenue = await revenueRows
            .GroupBy(r => r.ClinicBranchId)
            .Select(g => new { BranchId = g.Key, Revenue = g.Sum(r => r.Price) })
            .ToDictionaryAsync(x => x.BranchId, x => x.Revenue, cancellationToken);

        var byServiceCounts = await appointments
            .GroupBy(a => a.MedicalServiceId)
            .Select(g => new
            {
                ServiceId = g.Key,
                ServiceName = g.Select(a => a.MedicalService.Name).First(),
                SpecialtyName = g.Select(a => a.MedicalService.Specialty.Name).First(),
                Price = g.Select(a => a.MedicalService.Price).First(),
                Count = g.Count()
            })
            .ToListAsync(cancellationToken);

        var byServiceRevenue = await revenueRows
            .GroupBy(r => r.MedicalServiceId)
            .Select(g => new { ServiceId = g.Key, Revenue = g.Sum(r => r.Price) })
            .ToDictionaryAsync(x => x.ServiceId, x => x.Revenue, cancellationToken);

        var currencyTotals = await revenueRows
            .GroupBy(r => r.Currency)
            .Select(g => new { Currency = g.Key, Total = g.Sum(r => r.Price), Rows = g.Count() })
            .ToListAsync(cancellationToken);

        var doctorUserIds = byDoctorCounts.Select(d => d.UserId).ToList();
        var doctorNames = await _dbContext.Users
            .Where(u => doctorUserIds.Contains(u.Id))
            .Select(u => new { u.Id, u.FirstName, u.LastName })
            .ToDictionaryAsync(u => u.Id, cancellationToken);

        var statusCounts = byStatus.ToDictionary(s => s.Status, s => s.Count);
        int StatusCount(AppointmentStatus status) => statusCounts.TryGetValue(status, out var c) ? c : 0;

        var dominantCurrency = currencyTotals
            .OrderByDescending(c => c.Rows)
            .Select(c => c.Currency)
            .FirstOrDefault() ?? "EUR";

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
            TotalRevenue = currencyTotals.Sum(c => c.Total),
            Currency = dominantCurrency,
            ByDoctor = byDoctorCounts
                .Select(d => new DoctorAppointmentCountDto
                {
                    DoctorId = d.DoctorId,
                    DoctorName = doctorNames.TryGetValue(d.UserId, out var name)
                        ? $"{name.FirstName} {name.LastName}"
                        : "?",
                    AppointmentCount = d.Count,
                    CompletedCount = d.Completed,
                    CancelledCount = d.Cancelled,
                    NoShowCount = d.NoShow,
                    Revenue = byDoctorRevenue.TryGetValue(d.DoctorId, out var doctorRevenue) ? doctorRevenue : 0m
                })
                .OrderByDescending(d => d.AppointmentCount)
                .ToList(),
            ByBranch = byBranchCounts
                .Select(b => new BranchReportRowDto
                {
                    BranchId = b.BranchId,
                    BranchName = b.BranchName,
                    City = b.City,
                    AppointmentCount = b.Count,
                    CompletedCount = b.Completed,
                    CancelledCount = b.Cancelled,
                    Revenue = byBranchRevenue.TryGetValue(b.BranchId, out var branchRevenue) ? branchRevenue : 0m
                })
                .OrderByDescending(b => b.AppointmentCount)
                .ToList(),
            ByService = byServiceCounts
                .Select(s => new ServiceReportRowDto
                {
                    ServiceId = s.ServiceId,
                    ServiceName = s.ServiceName,
                    SpecialtyName = s.SpecialtyName,
                    Price = s.Price,
                    AppointmentCount = s.Count,
                    Revenue = byServiceRevenue.TryGetValue(s.ServiceId, out var serviceRevenue) ? serviceRevenue : 0m
                })
                .OrderByDescending(s => s.AppointmentCount)
                .ToList()
        };
    }

    private static AdminClinicDto ToAdminDto(Clinic clinic, IReadOnlyList<ClinicAdministratorDto> administrators) => new()
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
        Administrators = administrators
    };
}
