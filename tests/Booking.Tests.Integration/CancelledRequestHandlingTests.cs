using Booking.Api.Logging;
using Booking.Api.Middleware;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Serilog.Events;
using Serilog.Parsing;
using Xunit;

namespace Booking.Tests.Integration;

/// <summary>
/// Incidenti në prodhim: Neon-i po zgjohej, klienti u largua pas ~3s, dhe Npgsql-i hodhi
/// TaskCanceledException nga AuthenticateSASL (token-i ishte HttpContext.RequestAborted).
/// Kjo dilte si ERR + 500. Këto teste nuk kanë nevojë për DB — godasin middleware-in direkt.
/// </summary>
public class CancelledRequestHandlingTests
{
    [Fact]
    public async Task Client_abort_is_logged_as_information_not_error_and_not_500()
    {
        var logger = new RecordingLogger();
        var context = NewContext(abortedByClient: true);
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new TaskCanceledException("A task was canceled."), logger);

        await middleware.InvokeAsync(context);

        context.Response.StatusCode.Should().Be(ExceptionHandlingMiddleware.ClientClosedRequestStatusCode);
        logger.Entries.Should().ContainSingle()
            .Which.Level.Should().Be(LogLevel.Information);
        logger.Entries.Single().Message.Should().Contain("u anulua nga klienti");
    }

    [Fact]
    public async Task Cancellation_without_client_abort_is_still_a_500_error()
    {
        // P.sh. një timeout i brendshëm që anulon punën — ky ËSHTË problem yni.
        var logger = new RecordingLogger();
        var context = NewContext(abortedByClient: false);
        var middleware = new ExceptionHandlingMiddleware(
            _ => throw new OperationCanceledException(), logger);

        await middleware.InvokeAsync(context);

        context.Response.StatusCode.Should().Be(StatusCodes.Status500InternalServerError);
        logger.Entries.Should().ContainSingle().Which.Level.Should().Be(LogLevel.Error);
    }

    [Fact]
    public void Filter_drops_only_cancelled_ef_connection_errors()
    {
        CancelledConnectionLogFilter.IsCancelledConnectionError(
                Event("Microsoft.EntityFrameworkCore.Database.Connection", new TaskCanceledException()))
            .Should().BeTrue();

        // Timeout i vërtetë lidhjeje (ashtu si e hedh Npgsql-i për Timeout=) — mbetet Error.
        CancelledConnectionLogFilter.IsCancelledConnectionError(
                Event("Microsoft.EntityFrameworkCore.Database.Connection",
                    new InvalidOperationException("Exception while reading from stream", new TimeoutException())))
            .Should().BeFalse();

        // Anulim në një kategori tjetër — s'e prekim.
        CancelledConnectionLogFilter.IsCancelledConnectionError(
                Event("Booking.Api.SomethingElse", new TaskCanceledException()))
            .Should().BeFalse();
    }

    private static DefaultHttpContext NewContext(bool abortedByClient)
    {
        var context = new DefaultHttpContext();
        context.Request.Method = "GET";
        context.Request.Path = "/api/clinics";
        context.Response.Body = new MemoryStream();
        context.RequestAborted = abortedByClient ? new CancellationToken(canceled: true) : CancellationToken.None;
        return context;
    }

    private static LogEvent Event(string sourceContext, Exception exception) =>
        new(DateTimeOffset.UtcNow, LogEventLevel.Error, exception,
            new MessageTemplateParser().Parse("An error occurred using the connection"),
            [new LogEventProperty("SourceContext", new ScalarValue(sourceContext))]);

    private sealed class RecordingLogger : ILogger<ExceptionHandlingMiddleware>
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) =>
            Entries.Add((logLevel, formatter(state, exception)));
    }
}
