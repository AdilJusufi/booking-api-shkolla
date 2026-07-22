using Booking.Application.Features.Clinics;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Booking.Api.Controllers;

[ApiController]
[Route("api/specialties")]
[AllowAnonymous]
public class SpecialtiesController : ControllerBase
{
    private readonly IClinicQueryService _clinicQueryService;

    public SpecialtiesController(IClinicQueryService clinicQueryService)
    {
        _clinicQueryService = clinicQueryService;
    }

    [HttpGet]
    [ProducesResponseType(typeof(IReadOnlyList<SpecialtyDto>), StatusCodes.Status200OK)]
    public async Task<ActionResult<IReadOnlyList<SpecialtyDto>>> GetAll(CancellationToken cancellationToken) =>
        Ok(await _clinicQueryService.GetSpecialtiesAsync(cancellationToken));
}
