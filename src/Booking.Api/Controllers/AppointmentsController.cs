using Booking.Application.Common.Exceptions;
using Booking.Application.Common.Interfaces;
using Booking.Application.Common.Models;
using Booking.Application.Common.Security;
using Booking.Application.Features.Appointments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;

namespace Booking.Api.Controllers;

/// <summary>Terminet e pacientit të kyçur — qasje vetëm në rezervimet e veta.</summary>
[ApiController]
[Route("api/appointments")]
[Authorize(Policy = Policies.PatientOnly)]
public class AppointmentsController : ControllerBase
{
    private readonly IAppointmentService _appointmentService;
    private readonly ICurrentUserService _currentUser;

    public AppointmentsController(IAppointmentService appointmentService, ICurrentUserService currentUser)
    {
        _appointmentService = appointmentService;
        _currentUser = currentUser;
    }

    private Guid UserId => _currentUser.UserId ?? throw new AuthenticationFailedException();

    [HttpGet("my")]
    [ProducesResponseType(typeof(PagedResult<AppointmentDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<AppointmentDto>>> GetMy(
        [FromQuery] MyAppointmentsQuery query, CancellationToken cancellationToken) =>
        Ok(await _appointmentService.GetMyAppointmentsAsync(UserId, query, cancellationToken));

    [HttpGet("my/{id:guid}")]
    [ProducesResponseType(typeof(AppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<AppointmentDto>> GetMyById(Guid id, CancellationToken cancellationToken) =>
        Ok(await _appointmentService.GetMyAppointmentByIdAsync(UserId, id, cancellationToken));

    [HttpPost]
    [EnableRateLimiting("booking")]
    [ProducesResponseType(typeof(AppointmentDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<AppointmentDto>> Create(
        CreateAppointmentRequest request, CancellationToken cancellationToken)
    {
        var appointment = await _appointmentService.CreateAsync(UserId, request, cancellationToken);
        return CreatedAtAction(nameof(GetMyById), new { id = appointment.Id }, appointment);
    }

    [HttpPost("{id:guid}/cancel")]
    [ProducesResponseType(typeof(AppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<AppointmentDto>> Cancel(
        Guid id, CancelAppointmentRequest request, CancellationToken cancellationToken) =>
        Ok(await _appointmentService.CancelAsync(UserId, id, request, cancellationToken));

    [HttpPost("{id:guid}/reschedule")]
    [EnableRateLimiting("booking")]
    [ProducesResponseType(typeof(AppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<AppointmentDto>> Reschedule(
        Guid id, RescheduleAppointmentRequest request, CancellationToken cancellationToken) =>
        Ok(await _appointmentService.RescheduleAsync(UserId, id, request, cancellationToken));
}
