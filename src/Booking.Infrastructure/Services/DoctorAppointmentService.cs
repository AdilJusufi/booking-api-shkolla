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

namespace Booking.Infrastructure.Services;

public class DoctorAppointmentService : IDoctorAppointmentService
{
    private readonly BookingDbContext _dbContext;
    private readonly IDateTimeProvider _dateTimeProvider;
    private readonly ITimeZoneService _timeZoneService;

    public DoctorAppointmentService(
        BookingDbContext dbContext,
        IDateTimeProvider dateTimeProvider,
        ITimeZoneService timeZoneService)
    {
        _dbContext = dbContext;
        _dateTimeProvider = dateTimeProvider;
        _timeZoneService = timeZoneService;
    }

    public async Task<PagedResult<DoctorAppointmentDto>> GetMyCalendarAsync(
        Guid userId, DoctorAppointmentsQuery query, CancellationToken cancellationToken = default)
    {
        var doctorId = await GetDoctorIdAsync(userId, cancellationToken);

        var rows = QueryRows(a => a.DoctorId == doctorId);

        if (query.From is { } from)
        {
            var fromUtc = _timeZoneService.ToUtc(from.ToDateTime(TimeOnly.MinValue));
            rows = rows.Where(r => r.StartUtc >= fromUtc);
        }

        if (query.To is { } to)
        {
            var toUtc = _timeZoneService.ToUtc(to.AddDays(1).ToDateTime(TimeOnly.MinValue));
            rows = rows.Where(r => r.StartUtc < toUtc);
        }

        if (query.Status is { } status)
        {
            rows = rows.Where(r => r.Status == status);
        }

        var totalItems = await rows.CountAsync(cancellationToken);
        var items = await rows
            .OrderBy(r => r.StartUtc)
            .Skip((query.Page - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(cancellationToken);

        return new PagedResult<DoctorAppointmentDto>
        {
            Items = items.Select(ToDto).ToList(),
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

    public Task<DoctorAppointmentDto> ConfirmAsync(Guid userId, Guid appointmentId, CancellationToken cancellationToken = default) =>
        TransitionAsync(userId, appointmentId, AppointmentStatus.Confirmed, cancellationToken);

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

        return await ApplyTransitionAsync(doctorId, appointment, AppointmentStatus.NoShow, cancellationToken);
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
