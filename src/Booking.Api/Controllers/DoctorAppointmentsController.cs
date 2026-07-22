using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Appointments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>Kalendari i doktorit të kyçur — qasje vetëm në terminet e veta.</summary>
[ApiController]
[Route("api/doctor/appointments")]
[Authorize(Policy = Policies.DoctorOnly)]
public class DoctorAppointmentsController : ControllerBase
{
    private readonly IDoctorAppointmentService _doctorAppointmentService;
    private readonly ICurrentUserService _currentUser;

    public DoctorAppointmentsController(
        IDoctorAppointmentService doctorAppointmentService, ICurrentUserService currentUser)
    {
        _doctorAppointmentService = doctorAppointmentService;
        _currentUser = currentUser;
    }

    private Guid UserId => _currentUser.UserId ?? throw new AuthenticationFailedException();

    [HttpGet]
    [ProducesResponseType(typeof(PagedResult<DoctorAppointmentDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<DoctorAppointmentDto>>> GetCalendar(
        [FromQuery] DoctorAppointmentsQuery query, CancellationToken cancellationToken) =>
        Ok(await _doctorAppointmentService.GetMyCalendarAsync(UserId, query, cancellationToken));

    [HttpGet("{id:guid}")]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DoctorAppointmentDto>> GetById(Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorAppointmentService.GetByIdAsync(UserId, id, cancellationToken));

    [HttpPost("{id:guid}/confirm")]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<DoctorAppointmentDto>> Confirm(Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorAppointmentService.ConfirmAsync(UserId, id, cancellationToken));

    [HttpPost("{id:guid}/complete")]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<DoctorAppointmentDto>> Complete(Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorAppointmentService.CompleteAsync(UserId, id, cancellationToken));

    [HttpPost("{id:guid}/no-show")]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<DoctorAppointmentDto>> MarkNoShow(Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorAppointmentService.MarkNoShowAsync(UserId, id, cancellationToken));

    [HttpPut("{id:guid}/internal-note")]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<DoctorAppointmentDto>> UpdateInternalNote(
        Guid id, UpdateInternalNoteRequest request, CancellationToken cancellationToken) =>
        Ok(await _doctorAppointmentService.UpdateInternalNoteAsync(UserId, id, request, cancellationToken));
}
