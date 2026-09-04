using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Features.Appointments;
using Booking.Domain.Entities;
using Booking.Domain.Enums;
using Booking.Domain.Exceptions;
using Booking.Domain.Services;
using Booking.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Booking.Infrastructure.Services;

public class DoctorAppointmentService : IDoctorAppointmentService
{
    private readonly BookingDbContext _dbContext;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITimeZoneService _timeZoneService;
    private readonly IAppointmentNotificationService _notificationService;
    private readonly ILogger<DoctorAppointmentService> _logger;

    public DoctorAppointmentService(
        BookingDbContext dbContext,
        IDateTimeProvider dateTimeProvider,
        ITimeZoneService timeZoneService,
        IAppointmentNotificationService notificationService,
        ILogger<DoctorAppointmentService> logger)
    {
        _dbContext = dbContext;
        _dateTimeProvider = dateTimeProvider;
        _timeZoneService = timeZoneService;
        _notificationService = notificationService;
        _logger = logger;
    }

    public async Task<PagedResult<DoctorAppointmentDto>> GetMyCalendarAsync(
        Guid userId, DoctorAppointmentsQuery query, CancellationToken cancellationToken = default)
    {
        var doctorId = await GetDoctorIdAsync(userId, cancellationToken);

        // Filter/order/page on the Appointment entity itself, then project only the
        // page's rows — EF Core cannot translate Where/OrderBy applied after the
        // QueryRows projection below, since it embeds `.First()` subqueries.
        DateTime? fromUtc = query.From is { } from
            ? _timeZoneService.ToUtc(from.ToDateTime(TimeOnly.MinValue))
            : null;
        DateTime? toUtc = query.To is { } to
            ? _timeZoneService.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue))
            : null;

        var baseQuery = _dbContext.Appointments.Where(a =>
            a.DoctorId == doctorId &&
            (fromUtc == null || a.StartDateTime >= fromUtc) &&
            (toUtc == null || a.StartDateTime < toUtc) &&
            (query.Status == null || a.Status == query.Status));

        var totalItems = await baseQuery.CountAsync(cancellationToken);

        var pagedIds = await baseQuery
            .OrderBy(a => a.StartDateTime)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .Select(a => a.Id)
            .ToListAsync(cancellationToken);

        var rowsById = await QueryRows(a => pagedIds.Contains(a.Id))
            .ToDictionaryAsync(r => r.Id, cancellationToken);

        return new PagedResult<DoctorAppointmentDto>
        {
            Items = pagedIds.Select(id => ToDto(rowsById[id])).ToList(),
            Page = query.Page,
            PageSize = query.PageSize,
            TotalItems = totalItems
        };
    }

    public async Task<DoctorAppointmentDto> GetByIdAsync(
        Guid userId, Guid appointmentId, CancellationToken cancellationToken = default)
    {
        var doctorId = await GetDoctorIdAsync(userId, cancellationToken);

        var row = await QueryRows(a => a.Id == appointmentId && a.DoctorId == doctorId)
            .FirstOrDefaultAsync(cancellationToken)
            ?? throw new NotFoundException("Appointment", appointmentId);

        return ToDto(row);
    }

    public Task<DoctorAppointmentDto> CompleteAsync(Guid userId, Guid appointmentId, CancellationToken cancellationToken = default) =>
        TransitionAsync(userId, appointmentId, AppointmentStatus.Completed, cancellationToken);

    public async Task<DoctorAppointmentDto> MarkNoShowAsync(
        Guid userId, Guid appointmentId, CancellationToken cancellationToken = default)
    {
        var (doctorId, appointment) = await GetOwnedAppointmentAsync(userId, appointmentId, cancellationToken);

        if (_dateTimeProvider.UtcNow <= appointment.StartDateTime)
        {
            throw new BookingRuleException("no-show-before-start", "NoShow mund të shënohet vetëm pasi ka kaluar ora e terminit.");
        }

        var dto = await ApplyTransitionAsync(doctorId, appointment, AppointmentStatus.NoShow, cancellationToken);
        // Klinika duhet ta dijë — jo pacienti, i cili tashmë e ka humbur terminin.
        await NotifyClinicSafeAsync(_notificationService.AppointmentNoShowForStaffAsync, appointmentId, dto, cancellationToken);
        return dto;
    }

    public async Task<DoctorAppointmentDto> UpdateInternalNoteAsync(
        Guid userId, Guid appointmentId, UpdateInternalNoteRequest request, CancellationToken cancellationToken = default)
    {
        var (doctorId, appointment) = await GetOwnedAppointmentAsync(userId, appointmentId, cancellationToken);

        appointment.InternalNote = request.InternalNote;
        await SaveChangesGuardedAsync(cancellationToken);

        return await GetByIdForDoctorAsync(doctorId, appointment.Id, cancellationToken);
    }

    // ---------- Ndihmës ----------

    private async Task<DoctorAppointmentDto> TransitionAsync(
        Guid userId, Guid appointmentId, AppointmentStatus targetStatus, CancellationToken cancellationToken)
    {
        var (doctorId, appointment) = await GetOwnedAppointmentAsync(userId, appointmentId, cancellationToken);
        return await ApplyTransitionAsync(doctorId, appointment, targetStatus, cancellationToken);
    }

    private async Task<DoctorAppointmentDto> ApplyTransitionAsync(
        Guid doctorId, Appointment appointment, AppointmentStatus targetStatus, CancellationToken cancellationToken)
    {
        if (!BookingPolicy.CanTransition(appointment.Status, targetStatus))
        {
            throw new BookingRuleException(
                "invalid-status-transition",
                $"Kalimi nga {appointment.Status} në {targetStatus} nuk lejohet.");
        }

        appointment.Status = targetStatus;
        await SaveChangesGuardedAsync(cancellationToken);

        return await GetByIdForDoctorAsync(doctorId, appointment.Id, cancellationToken);
    }

    private async Task<Guid> GetDoctorIdAsync(Guid userId, CancellationToken cancellationToken)
    {
        var doctorId = await _dbContext.Doctors
            .Where(d => d.UserId == userId && d.IsActive)
            .Select(d => (Guid?)d.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return doctorId ?? throw new NotFoundException("Profili i doktorit nuk u gjet për këtë përdorues.");
    }

    private async Task<(Guid DoctorId, Appointment Appointment)> GetOwnedAppointmentAsync(
        Guid userId, Guid appointmentId, CancellationToken cancellationToken)
    {
        var doctorId = await GetDoctorIdAsync(userId, cancellationToken);

        var appointment = await _dbContext.Appointments
            .FirstOrDefaultAsync(a => a.Id == appointmentId && a.DoctorId == doctorId, cancellationToken)
            ?? throw new NotFoundException("Appointment", appointmentId);

        return (doctorId, appointment);
    }

    private async Task<DoctorAppointmentDto> GetByIdForDoctorAsync(
        Guid doctorId, Guid appointmentId, CancellationToken cancellationToken)
    {
        var row = await QueryRows(a => a.Id == appointmentId && a.DoctorId == doctorId)
            .FirstAsync(cancellationToken);
        return ToDto(row);
    }

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
    }

    /// <summary>Doktori e ka kryer vetë veprimin — vetëm klinika njoftohet, jo doktori.</summary>
    private async Task NotifyClinicSafeAsync(
        Func<AppointmentStaffNotificationContext, CancellationToken, Task> send,
        Guid appointmentId, DoctorAppointmentDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var info = await _dbContext.Appointments
                .Where(a => a.Id == appointmentId)
                .Select(a => new
                {
                    a.ClinicId,
                    ClinicName = a.Clinic.Name,
                    DoctorName = _dbContext.Users.Where(u => u.Id == a.Doctor.UserId).Select(u => u.FirstName + " " + u.LastName).First()
                })
                .FirstAsync(cancellationToken);

            var clinicAdmins = await ClinicAdministratorLookup.LoadForClinicAsync(_dbContext, info.ClinicId, cancellationToken);

            await send(new AppointmentStaffNotificationContext
            {
                AppointmentId = dto.Id,
                PatientName = dto.PatientName,
                DoctorName = info.DoctorName,
                DoctorEmail = null,
                ClinicName = info.ClinicName,
                ClinicAdminEmails = clinicAdmins.Select(a => a.Email).ToList(),
                ServiceName = dto.ServiceName,
                StartDateTimeLocal = dto.StartDateTime
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Njoftimi i klinikës dështoi për terminin {AppointmentId}; veprimi mbetet i vlefshëm", dto.Id);
        }
    }

    // ---------- Projeksioni ----------

    private sealed record DoctorAppointmentRow(
        Guid Id, Guid BranchId, string BranchName, Guid ServiceId, string ServiceName,
        string PatientFirstName, string PatientLastName, string? PatientPhoneNumber,
        Guid? DependentId, string? DependentFirstName, string? DependentLastName,
        DateTime StartUtc, DateTime EndUtc, AppointmentStatus Status,
        string? PatientNote, string? InternalNote, string? CancellationReason);

    private IQueryable<DoctorAppointmentRow> QueryRows(
        System.Linq.Expressions.Expression<Func<Appointment, bool>> predicate)
    {
        return _dbContext.Appointments
            .Where(predicate)
            .Select(a => new DoctorAppointmentRow(
                a.Id, a.ClinicBranchId, a.ClinicBranch.Name, a.MedicalServiceId, a.MedicalService.Name,
                _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.FirstName).First(),
                _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.LastName).First(),
                _dbContext.Users.Where(u => u.Id == a.PatientProfile.UserId).Select(u => u.PhoneNumber).First(),
                a.DependentId,
                a.Dependent != null ? a.Dependent.FirstName : null,
                a.Dependent != null ? a.Dependent.LastName : null,
                a.StartDateTime, a.EndDateTime, a.Status,
                a.PatientNote, a.InternalNote, a.CancellationReason));
    }

    private DoctorAppointmentDto ToDto(DoctorAppointmentRow row) => new()
    {
        Id = row.Id,
        ClinicBranchId = row.BranchId,
        BranchName = row.BranchName,
        MedicalServiceId = row.ServiceId,
        ServiceName = row.ServiceName,
        PatientName = $"{row.PatientFirstName} {row.PatientLastName}",
        PatientPhoneNumber = row.PatientPhoneNumber,
        DependentId = row.DependentId,
        DependentName = row.DependentFirstName is null ? null : $"{row.DependentFirstName} {row.DependentLastName}",
        StartDateTime = _timeZoneService.ToLocal(row.StartUtc),
        EndDateTime = _timeZoneService.ToLocal(row.EndUtc),
        Status = row.Status,
        PatientNote = row.PatientNote,
        InternalNote = row.InternalNote,
        CancellationReason = row.CancellationReason
    };
}
