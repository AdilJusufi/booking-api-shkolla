using Booking.Application.Common.Models;
using Booking.Application.Features.Availability;
using Booking.Application.Features.Doctors;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

/// <summary>
/// Doktorët: lista është publike por e kufizuar për vizitorët e pakyçur (shih PublicPreview);
/// profili, shërbimet dhe disponueshmëria kërkojnë autentifikim.
/// </summary>
[ApiController]
[Route("api/doctors")]
// Default-deny: çdo veprim kërkon login, përveç atyre me [AllowAnonymous] eksplicit më poshtë.
// Kurrë [AllowAnonymous] në nivel klase — ai e anashkalon çdo [Authorize] të veprimeve.
[Authorize]
public class DoctorsController : ControllerBase
{
    private readonly IDoctorQueryService _doctorQueryService;
    private readonly IAvailabilityService _availabilityService;

    public DoctorsController(IDoctorQueryService doctorQueryService, IAvailabilityService availabilityService)
    {
        _doctorQueryService = doctorQueryService;
        _availabilityService = availabilityService;
    }

    [HttpGet]
    [AllowAnonymous]
    [ProducesResponseType(typeof(PagedResult<DoctorDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<DoctorDto>>> Search(
        [FromQuery] DoctorSearchRequest request, CancellationToken cancellationToken) =>
        Ok(await _doctorQueryService.SearchAsync(request, cancellationToken));

    [HttpGet("{id:guid}")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(DoctorDetailsDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DoctorDetailsDto>> GetById(Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorQueryService.GetByIdAsync(id, cancellationToken));

    [HttpGet("{id:guid}/services")]
    [AllowAnonymous]
    [ProducesResponseType(typeof(IReadOnlyList<DoctorServiceDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<DoctorServiceDto>>> GetServices(Guid id, CancellationToken cancellationToken) =>
        Ok(await _doctorQueryService.GetServicesAsync(id, cancellationToken));

    /// <summary>Slotet e lira për një doktor/degë/shërbim në një datë. Oret në orën e Prishtinës.</summary>
    [HttpGet("{id:guid}/available-slots")]
    [Authorize]
    [ProducesResponseType(typeof(IReadOnlyList<AvailableSlotDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<IReadOnlyList<AvailableSlotDto>>> GetAvailableSlots(
        Guid id, [FromQuery] AvailableSlotsQuery query, CancellationToken cancellationToken) =>
        Ok(await _availabilityService.GetAvailableSlotsAsync(id, query, cancellationToken));

    /// <summary>Gjendja e ditëve (Closed/Full/Available) për kalendarin e rezervimit, maksimum 62 ditë për kërkesë.</summary>
    [HttpGet("{id:guid}/available-days")]
    [Authorize]
    [ProducesResponseType(typeof(IReadOnlyList<AvailableDayDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status422UnprocessableEntity)]
    public async Task<ActionResult<IReadOnlyList<AvailableDayDto>>> GetAvailableDays(
        Guid id, [FromQuery] AvailableDaysQuery query, CancellationToken cancellationToken) =>
        Ok(await _availabilityService.GetAvailableDaysAsync(id, query, cancellationToken));
}
