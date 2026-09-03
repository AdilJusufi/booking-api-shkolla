using Booking.Api.Startup;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// FluentValidationFilter dështon i hapur: një argument pa IValidator&lt;T&gt; kalon pa u
/// validuar dhe pa asnjë sinjal. Kjo e kthen atë hendek në një test që dështon.
///
/// Program.cs e bën të njëjtin kontroll në nisje, por rrëzon vetëm jashtë prodhimit —
/// një validator që mungon s'duhet ta rrëzojë API-n gjatë deploy-it. Ky test është arsyeja
/// pse ai zbutje është e sigurt: hendeku kapet këtu, në CI, para se të mbërrijë atje.
/// </summary>
[Collection("api")]
public class ValidatorCoverageTests
{
    private readonly BookingApiFactory _factory;

    public ValidatorCoverageTests(BookingApiFactory factory)
    {
        _factory = factory;
    }

    [Fact]
    public void Every_request_dto_bound_by_a_controller_action_has_a_registered_validator()
    {
        var unvalidated = ValidatorCoverage.FindUnvalidatedPayloadTypes(
            _factory.Services,
            typeof(Program).Assembly,
            typeof(Booking.Application.DependencyInjection).Assembly);

        unvalidated.Should().BeEmpty(
            "çdo DTO i lidhur nga një action duhet të ketë AbstractValidator<T> — pa të, "
            + "FluentValidationFilter e kalon kërkesën pa e validuar fare dhe pa asnjë gabim");
    }

    /// <summary>
    /// Mbron vetë kontrollin: nëse skanimi ndalonte së gjeturi tipa (p.sh. filtri i
    /// assembly-së ndryshon, ose reflektimi s'kap më action-et), ai do të kthente listë
    /// bosh dhe testi i mësipërm do të kalonte gjithmonë — jeshile pa kuptim.
    /// </summary>
    [Fact]
    public void The_scan_actually_finds_payload_types_to_check()
    {
        var unvalidatedWhenNothingIsRegistered = ValidatorCoverage.FindUnvalidatedPayloadTypes(
            new ServiceCollection().BuildServiceProvider(),
            typeof(Program).Assembly,
            typeof(Booking.Application.DependencyInjection).Assembly);

        unvalidatedWhenNothingIsRegistered.Should().NotBeEmpty(
            "pa asnjë validator të regjistruar, skanimi duhet t'i raportojë TË GJITHË DTO-të");
    }
}
