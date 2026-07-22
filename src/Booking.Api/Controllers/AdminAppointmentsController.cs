using Booking.Application.Common.Security;
using Booking.Application.Features.Admin;
using Booking.Application.Features.Appointments;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>Menaxhimi i termineve nga administrata — pa cutoff orësh, gjithmonë me audit log.</summary>
[ApiController]
[Route("api/admin/appointments")]
[Authorize(Policy = Policies.ClinicAdminOnly)]
public class AdminAppointmentsController : ControllerBase
{
    private readonly IAdminAppointmentService _adminAppointmentService;

    public AdminAppointmentsController(IAdminAppointmentService adminAppointmentService)
    {
        _adminAppointmentService = adminAppointmentService;
    }

    [HttpPost]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DoctorAppointmentDto>> CreateForPatient(
        AdminCreateAppointmentRequest request, CancellationToken cancellationToken)
    {
        var appointment = await _adminAppointmentService.CreateForPatientAsync(request, cancellationToken);
        return StatusCode(StatusCodes.Status201Created, appointment);
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<DoctorAppointmentDto>> Update(
        Guid id, AdminUpdateAppointmentRequest request, CancellationToken cancellationToken) =>
        Ok(await _adminAppointmentService.UpdateAsync(id, request, cancellationToken));

    [HttpPost("{id:guid}/cancel")]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<DoctorAppointmentDto>> Cancel(
        Guid id, AdminCancelAppointmentRequest request, CancellationToken cancellationToken) =>
        Ok(await _adminAppointmentService.CancelAsync(id, request, cancellationToken));

    [HttpPost("{id:guid}/reschedule")]
    [ProducesResponseType(typeof(DoctorAppointmentDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status409Conflict)]
    public async Task<ActionResult<DoctorAppointmentDto>> Reschedule(
        Guid id, AdminRescheduleAppointmentRequest request, CancellationToken cancellationToken) =>
        Ok(await _adminAppointmentService.RescheduleAsync(id, request, cancellationToken));
}
