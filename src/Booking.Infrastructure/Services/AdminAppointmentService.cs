using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Booking.Application.Features.Availability;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Domain.Exceptions;
using Booking.Domain.Services;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Npgsql;

namespace Booking.Infrastructure.Services;

public class AdminAppointmentService : IAdminAppointmentService
{
    private readonly BookingDbContext _dbContext;
    private readonly TenantAccessService _tenantAccess;
    private readonly IAvailabilityService _availabilityService;
    private readonly IAppointmentNotificationService _notificationService;
    private readonly IAuditService _auditService;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITimeZoneService _timeZoneService;
    private readonly ILogger<AdminAppointmentService> _logger;

    public AdminAppointmentService(
        BookingDbContext dbContext,
        TenantAccessService tenantAccess,
        IAvailabilityService availabilityService,
        IAppointmentNotificationService notificationService,
        IAuditService auditService,
        IDateTimeProvider dateTimeProvider,
        ITimeZoneService timeZoneService,
        ILogger<AdminAppointmentService> logger)
    {
        _dbContext = dbContext;
        _tenantAccess = tenantAccess;
        _availabilityService = availabilityService;
        _notificationService = notificationService;
        _auditService = auditService;
        _dateTimeProvider = dateTimeProvider;
        _timeZoneService = timeZoneService;
        _logger = logger;
    }

    public async Task<PagedResult<AdminAppointmentListItemDto>> GetAsync(
        AdminAppointmentsQuery query, CancellationToken cancellationToken = default)
    {
        // Tenant scoping: i njëjti model si GetMyClinicsAsync — SuperAdmin sheh gjithçka,
        // ClinicAdmin vetëm klinikat ku është i caktuar. Klinikat e huaja thjesht
        // nuk hyjnë në rezultat (listë e zbrazët), njësoj si diku tjetër në kod.
        var rows =
            from a in _dbContext.Appointments
            join patientUser in _dbContext.Users on a.PatientProfile.UserId equals patientUser.Id
            join doctorUser in _dbContext.Users on a.Doctor.UserId equals doctorUser.Id
            where _tenantAccess.IsSuperAdmin
                  || _dbContext.ClinicAdministrators.Any(admin =>
                      admin.UserId == _tenantAccess.CurrentUserId && admin.ClinicId == a.ClinicId)
            select new { Appointment = a, PatientUser = patientUser, DoctorUser = doctorUser };

        if (query.ClinicId is { } clinicId)
        {
            rows = rows.Where(r => r.Appointment.ClinicId == clinicId);
        }

        if (query.DoctorId is { } doctorId)
        {
            rows = rows.Where(r => r.Appointment.DoctorId == doctorId);
        }

        if (query.ClinicBranchId is { } branchId)
        {
            rows = rows.Where(r => r.Appointment.ClinicBranchId == branchId);
        }

        if (query.Status is { } status)
        {
            rows = rows.Where(r => r.Appointment.Status == status);
        }

        if (query.From is { } from)
        {
            var fromUtc = _timeZoneService.ToUtc(from.ToDateTime(TimeOnly.MinValue));
            rows = rows.Where(r => r.Appointment.StartDateTime >= fromUtc);
        }

        if (query.To is { } to)
        {
            var toUtc = _timeZoneService.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue));
            rows = rows.Where(r => r.Appointment.StartDateTime < toUtc);
        }

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var pattern = $"%{query.Search.Trim()}%";
            rows = rows.Where(r =>
                EF.Functions.ILike(r.PatientUser.FirstName + " " + r.PatientUser.LastName, pattern)
                || (r.Appointment.Dependent != null
                    && EF.Functions.ILike(
                        r.Appointment.Dependent.FirstName + " " + r.Appointment.Dependent.LastName, pattern))
                || EF.Functions.ILike(r.Appointment.Id.ToString(), pattern));
        }

        var totalItems = await rows.CountAsync(cancellationToken);

        var page = await rows
            .OrderByDescending(r => r.Appointment.StartDateTime)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(r => new
            {
                r.Appointment.Id,
                r.Appointment.ClinicId,
                ClinicName = r.Appointment.Clinic.Name,
                r.Appointment.ClinicBranchId,
                BranchName = r.Appointment.ClinicBranch.Name,
                r.Appointment.DoctorId,
                DoctorFirstName = r.DoctorUser.FirstName,
                DoctorLastName = r.DoctorUser.LastName,
                DoctorSpecialty = r.Appointment.Doctor.DoctorSpecialties
                    .Select(ds => ds.Specialty.Name)
                    .FirstOrDefault(),
                r.Appointment.MedicalServiceId,
                ServiceName = r.Appointment.MedicalService.Name,
                PatientFirstName = r.PatientUser.FirstName,
                PatientLastName = r.PatientUser.LastName,
                r.Appointment.DependentId,
                DependentFirstName = r.Appointment.Dependent != null ? r.Appointment.Dependent.FirstName : null,
                DependentLastName = r.Appointment.Dependent != null ? r.Appointment.Dependent.LastName : null,
                r.Appointment.StartDateTime,
                r.Appointment.EndDateTime,
                r.Appointment.Status,
                r.Appointment.Version
            })
            .ToListAsync(cancellationToken);

        var items = page
            .Select(r => new AdminAppointmentListItemDto
            {
                Id = r.Id,
                ClinicId = r.ClinicId,
                ClinicName = r.ClinicName,
                ClinicBranchId = r.ClinicBranchId,
                BranchName = r.BranchName,
                DoctorId = r.DoctorId,
                DoctorName = $"{r.DoctorFirstName} {r.DoctorLastName}",
                DoctorSpecialty = r.DoctorSpecialty,
                MedicalServiceId = r.MedicalServiceId,
                ServiceName = r.ServiceName,
                PatientName = $"{r.PatientFirstName} {r.PatientLastName}",
                IsForDependent = r.DependentId is not null,
                DependentId = r.DependentId,
                DependentName = r.DependentId is null ? null : $"{r.DependentFirstName} {r.DependentLastName}",
                StartDateTime = _timeZoneService.ToLocal(r.StartDateTime),
                EndDateTime = _timeZoneService.ToLocal(r.EndDateTime),
                Status = r.Status,
                Version = r.Version
            })
            .ToList();

        return new PagedResult<AdminAppointmentListItemDto>
        {
            Items = items,
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = totalItems
        };
    }

    public async Task<DoctorAppointmentDto> CreateForPatientAsync(
        AdminCreateAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        var branch = await _dbContext.ClinicBranches
            .Where(b => b.Id == request.ClinicBranchId && b.IsActive)
            .Select(b => new { b.ClinicId })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("ClinicBranch", request.ClinicBranchId);

        await _tenantAccess.EnsureCanManageClinicAsync(branch.ClinicId, cancellationToken);

        // Pacienti identifikohet ose me profil-id (nga kërkimi/krijimi te
        // api/admin/patients) ose me email për pajtueshmëri me thirrjet e vjetra.
        // Validatori garanton se vjen saktësisht njëri.
        var patientQuery =
            from p in _dbContext.PatientProfiles
            join u in _dbContext.Users on p.UserId equals u.Id
            where u.IsActive
            select new { PatientProfileId = p.Id, p.UserId, u.Email };

        patientQuery = request.PatientProfileId is { } patientProfileId
            ? patientQuery.Where(x => x.PatientProfileId == patientProfileId)
            : patientQuery.Where(x => x.Email == request.PatientEmail);

        var patient = await patientQuery.FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Pacienti nuk u gjet ose është joaktiv.");

        if (request.DependentId is { } dependentId)
        {
            var ownsDependent = await _dbContext.Dependents.AnyAsync(
                d => d.Id == dependentId && d.PatientProfileId == patient.PatientProfileId && d.IsActive, cancellationToken);
            if (!ownsDependent)
            {
                throw new BookingRuleException("dependent-not-owned", "Dependenti nuk i përket këtij pacienti.");
            }
        }

        var startUtc = _timeZoneService.ToUtc(request.StartDateTime);
        if (startUtc <= _dateTimeProvider.UtcNow)
        {
            throw new BookingRuleException("appointment-in-past", "Termini nuk mund të rezervohet në të kaluarën.");
        }

        var durationMinutes = await GetEffectiveDurationAsync(request.DoctorId, request.MedicalServiceId, cancellationToken);
        var endUtc = startUtc.AddMinutes(durationMinutes);

        var personOverlap = await _dbContext.Appointments.AnyAsync(a =>
            a.PatientProfileId == patient.PatientProfileId
            && a.DependentId == request.DependentId
            && Appointment.BlockingStatuses.Contains(a.Status)
            && a.StartDateTime < endUtc
            && a.EndDateTime > startUtc, cancellationToken);
        if (personOverlap)
        {
            throw new ConflictException("patient-appointment-overlap", "Pacienti ka tashmë termin në këtë orar.");
        }

        var slotAvailable = await _availabilityService.IsSlotAvailableAsync(
            request.DoctorId, request.ClinicBranchId, request.MedicalServiceId, request.StartDateTime,
            excludeAppointmentId: null, cancellationToken);
        if (!slotAvailable)
        {
            throw new ConflictException("appointment-conflict", "Sloti i zgjedhur nuk është i lirë.");
        }

        var appointment = new Appointment
        {
            ClinicId = branch.ClinicId,
            ClinicBranchId = request.ClinicBranchId,
            DoctorId = request.DoctorId,
            MedicalServiceId = request.MedicalServiceId,
            PatientProfileId = patient.PatientProfileId,
            DependentId = request.DependentId,
            StartDateTime = startUtc,
            EndDateTime = endUtc,
            Status = AppointmentStatus.Confirmed, // e krijoi vetë klinika — konfirmohet direkt
            PatientNote = request.PatientNote,
            InternalNote = request.InternalNote
        };
        _dbContext.Appointments.Add(appointment);

        _auditService.Record("APPOINTMENT_CREATED_BY_ADMIN", nameof(Appointment), appointment.Id.ToString(), null,
            new { patient.PatientProfileId, request.DoctorId, StartUtc = startUtc, EndUtc = endUtc });

        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetDtoAsync(appointment.Id, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentConfirmedAsync, patient.UserId, dto, cancellationToken);
        await NotifyDoctorSafeAsync(_notificationService.AppointmentCreatedForStaffAsync, appointment.Id, dto, cancellationToken);
        return dto;
    }

    public async Task<DoctorAppointmentDto> UpdateAsync(
        Guid appointmentId, AdminUpdateAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageAppointmentAsync(appointmentId, cancellationToken);
        var appointment = await GetAppointmentAsync(appointmentId, cancellationToken);

        var oldValues = new { appointment.Status, appointment.InternalNote };

        if (request.Status is { } targetStatus)
        {
            if (!BookingPolicy.CanTransition(appointment.Status, targetStatus))
            {
                throw new BookingRuleException(
                    "invalid-status-transition", $"Kalimi nga {appointment.Status} në {targetStatus} nuk lejohet.");
            }

            appointment.Status = targetStatus;
        }

        if (request.InternalNote is not null)
        {
            appointment.InternalNote = request.InternalNote;
        }

        _auditService.Record("APPOINTMENT_UPDATED_BY_ADMIN", nameof(Appointment), appointmentId.ToString(),
            oldValues, new { appointment.Status, appointment.InternalNote });

        await SaveChangesGuardedAsync(cancellationToken);
        return await GetDtoAsync(appointmentId, cancellationToken);
    }

    public async Task<DoctorAppointmentDto> CancelAsync(
        Guid appointmentId, AdminCancelAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageAppointmentAsync(appointmentId, cancellationToken);
        var appointment = await GetAppointmentAsync(appointmentId, cancellationToken);

        if (!BookingPolicy.CanTransition(appointment.Status, AppointmentStatus.CancelledByClinic))
        {
            throw new BookingRuleException(
                "not-cancellable", $"Termini me status {appointment.Status} nuk mund të anulohet.");
        }

        // Klinika s'ka kufizim orësh — por çdo anulim administrativ auditohet.
        _auditService.Record("APPOINTMENT_CANCELLED_BY_ADMIN", nameof(Appointment), appointmentId.ToString(),
            new { appointment.Status }, new { Status = AppointmentStatus.CancelledByClinic, request.Reason });

        appointment.Status = AppointmentStatus.CancelledByClinic;
        appointment.CancellationReason = request.Reason;
        appointment.CancelledByUserId = _tenantAccess.CurrentUserId;
        appointment.CancelledAt = _dateTimeProvider.UtcNow;

        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetDtoAsync(appointmentId, cancellationToken);
        var patientUserId = await GetPatientUserIdAsync(appointment.PatientProfileId, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentCancelledAsync, patientUserId, dto, cancellationToken);
        await NotifyDoctorSafeAsync(_notificationService.AppointmentCancelledForStaffAsync, appointmentId, dto, cancellationToken);
        return dto;
    }

    public async Task<DoctorAppointmentDto> RescheduleAsync(
        Guid appointmentId, AdminRescheduleAppointmentRequest request, CancellationToken cancellationToken = default)
    {
        await _tenantAccess.EnsureCanManageAppointmentAsync(appointmentId, cancellationToken);
        var existing = await GetAppointmentAsync(appointmentId, cancellationToken);

        if (!BookingPolicy.CanTransition(existing.Status, AppointmentStatus.Rescheduled))
        {
            throw new BookingRuleException(
                "not-reschedulable", $"Termini me status {existing.Status} nuk mund të riplanifikohet.");
        }

        var newStartUtc = _timeZoneService.ToUtc(request.NewStartDateTime);
        if (newStartUtc <= _dateTimeProvider.UtcNow)
        {
            throw new BookingRuleException("appointment-in-past", "Termini i ri nuk mund të jetë në të kaluarën.");
        }

        var durationMinutes = await GetEffectiveDurationAsync(existing.DoctorId, existing.MedicalServiceId, cancellationToken);
        var newEndUtc = newStartUtc.AddMinutes(durationMinutes);

        var slotAvailable = await _availabilityService.IsSlotAvailableAsync(
            existing.DoctorId, existing.ClinicBranchId, existing.MedicalServiceId, request.NewStartDateTime,
            excludeAppointmentId: existing.Id, cancellationToken);
        if (!slotAvailable)
        {
            throw new ConflictException("appointment-conflict", "Sloti i ri nuk është i lirë.");
        }

        existing.Status = AppointmentStatus.Rescheduled;

        var replacement = new Appointment
        {
            ClinicId = existing.ClinicId,
            ClinicBranchId = existing.ClinicBranchId,
            DoctorId = existing.DoctorId,
            MedicalServiceId = existing.MedicalServiceId,
            PatientProfileId = existing.PatientProfileId,
            DependentId = existing.DependentId,
            StartDateTime = newStartUtc,
            EndDateTime = newEndUtc,
            Status = AppointmentStatus.Confirmed,
            PatientNote = existing.PatientNote,
            InternalNote = existing.InternalNote
        };
        _dbContext.Appointments.Add(replacement);

        // Rregulli 13: riplanifikimi nga ClinicAdmin ruhet gjithmonë në audit log.
        _auditService.Record("APPOINTMENT_RESCHEDULED_BY_ADMIN", nameof(Appointment), existing.Id.ToString(),
            new { OldStart = existing.StartDateTime, OldEnd = existing.EndDateTime },
            new { NewAppointmentId = replacement.Id, NewStart = newStartUtc, NewEnd = newEndUtc });

        await SaveChangesGuardedAsync(cancellationToken);

        var dto = await GetDtoAsync(replacement.Id, cancellationToken);
        var patientUserId = await GetPatientUserIdAsync(existing.PatientProfileId, cancellationToken);
        await NotifySafeAsync(_notificationService.AppointmentRescheduledAsync, patientUserId, dto, cancellationToken);
        await NotifyDoctorSafeAsync(_notificationService.AppointmentRescheduledForStaffAsync, replacement.Id, dto, cancellationToken);
        return dto;
    }

    // ---------- Ndihmës ----------

    private async Task<Appointment> GetAppointmentAsync(Guid appointmentId, CancellationToken cancellationToken) =>
        await _dbContext.Appointments.FirstOrDefaultAsync(a => a.Id == appointmentId, cancellationToken)
        ?? throw new NotFoundException("Appointment", appointmentId);

    private async Task<int> GetEffectiveDurationAsync(Guid doctorId, Guid serviceId, CancellationToken cancellationToken)
    {
        var doctorService = await _dbContext.DoctorServices
            .Where(ds => ds.DoctorId == doctorId && ds.MedicalServiceId == serviceId && ds.IsActive)
            .Select(ds => new { ds.CustomDurationMinutes, BaseDuration = ds.MedicalService.DurationMinutes })
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new BookingRuleException("service-not-offered-by-doctor", "Doktori nuk e ofron këtë shërbim.");

        return doctorService.CustomDurationMinutes ?? doctorService.BaseDuration;
    }

    private async Task<Guid> GetPatientUserIdAsync(Guid patientProfileId, CancellationToken cancellationToken) =>
        await _dbContext.PatientProfiles
            .Where(p => p.Id == patientProfileId)
            .Select(p => p.UserId)
            .FirstAsync(cancellationToken);

    private async Task SaveChangesGuardedAsync(CancellationToken cancellationToken)
    {
        try
        {
            await _dbContext.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException)
        {
            throw new ConflictException(
                "concurrency-conflict", "Termini u ndryshua nga një veprim tjetër. Rifresko dhe provo përsëri.");
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException { SqlState: "23P01" })
        {
            throw new ConflictException("appointment-conflict", "Sloti i zgjedhur nuk është më i lirë.");
        }
    }

    private async Task NotifySafeAsync(
        Func<AppointmentNotificationContext, CancellationToken, Task> send,
        Guid patientUserId, DoctorAppointmentDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var user = await _dbContext.Users
                .Where(u => u.Id == patientUserId)
                .Select(u => new { u.Email, u.PhoneNumber, u.FirstName, u.LastName })
                .FirstAsync(cancellationToken);

            var clinicName = await _dbContext.ClinicBranches
                .Where(b => b.Id == dto.ClinicBranchId)
                .Select(b => b.Clinic.Name)
                .FirstAsync(cancellationToken);

            var doctorName = await _dbContext.Appointments
                .Where(a => a.Id == dto.Id)
                .Select(a => _dbContext.Users
                    .Where(u => u.Id == a.Doctor.UserId)
                    .Select(u => u.FirstName + " " + u.LastName)
                    .First())
                .FirstAsync(cancellationToken);

            await send(new AppointmentNotificationContext
            {
                AppointmentId = dto.Id,
                PatientEmail = user.Email,
                PatientPhoneNumber = user.PhoneNumber,
                PatientName = $"{user.FirstName} {user.LastName}",
                DoctorName = doctorName,
                ClinicName = clinicName,
                ServiceName = dto.ServiceName,
                StartDateTimeLocal = dto.StartDateTime
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Njoftimi dështoi për terminin {AppointmentId}; veprimi mbetet i vlefshëm", dto.Id);
        }
    }

    /// <summary>
    /// Klinika e ka kryer vetë veprimin — vetëm doktori njoftohet (ClinicAdminEmails bosh).
    /// </summary>
    private async Task NotifyDoctorSafeAsync(
        Func<AppointmentStaffNotificationContext, CancellationToken, Task> send,
        Guid appointmentId, DoctorAppointmentDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var info = await _dbContext.Appointments
                .Where(a => a.Id == appointmentId)
                .Select(a => new
                {
                    ClinicName = a.Clinic.Name,
                    DoctorEmail = _dbContext.Users.Where(u => u.Id == a.Doctor.UserId).Select(u => u.Email).First(),
                    DoctorName = _dbContext.Users.Where(u => u.Id == a.Doctor.UserId).Select(u => u.FirstName + " " + u.LastName).First()
                })
                .FirstAsync(cancellationToken);

            await send(new AppointmentStaffNotificationContext
            {
                AppointmentId = dto.Id,
                PatientName = dto.PatientName,
                DoctorName = info.DoctorName,
                DoctorEmail = info.DoctorEmail,
                ClinicName = info.ClinicName,
                ClinicAdminEmails = [],
                ServiceName = dto.ServiceName,
                StartDateTimeLocal = dto.StartDateTime
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Njoftimi i doktorit dështoi për terminin {AppointmentId}; veprimi mbetet i vlefshëm", dto.Id);
        }
    }

    private async Task<DoctorAppointmentDto> GetDtoAsync(Guid appointmentId, CancellationToken cancellationToken)
    {
        var row = await _dbContext.Appointments
            .Where(a => a.Id == appointmentId)
            .Select(a => new
            {
                a.Id,
                a.ClinicBranchId,
                BranchName = a.ClinicBranch.Name,
                a.MedicalServiceId,
                ServiceName = a.MedicalService.Name,
                PatientFirstName = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.FirstName).First(),
                PatientLastName = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.LastName).First(),
                PatientPhoneNumber = _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.PhoneNumber).First(),
                a.DependentId,
                DependentFirstName = a.Dependent != null ? a.Dependent.FirstName : null,
                DependentLastName = a.Dependent != null ? a.Dependent.LastName : null,
                a.StartDateTime,
                a.EndDateTime,
                a.Status,
                a.PatientNote,
                a.InternalNote,
                a.CancellationReason
            })
            .FirstAsync(cancellationToken);

        return new DoctorAppointmentDto
        {
            Id = row.Id,
            ClinicBranchId = row.ClinicBranchId,
            BranchName = row.BranchName,
            MedicalServiceId = row.MedicalServiceId,
            ServiceName = row.ServiceName,
            PatientName = $"{row.PatientFirstName} {row.PatientLastName}",
            PatientPhoneNumber = row.PatientPhoneNumber,
            DependentId = row.DependentId,
            DependentName = row.DependentFirstName is null ? null : $"{row.DependentFirstName} {row.DependentLastName}",
            StartDateTime = _timeZoneService.ToLocal(row.StartDateTime),
            EndDateTime = _timeZoneService.ToLocal(row.EndDateTime),
            Status = row.Status,
            PatientNote = row.PatientNote,
            InternalNote = row.InternalNote,
            CancellationReason = row.CancellationReason
        };
    }
}
